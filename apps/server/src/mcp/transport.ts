import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../logger.js';
import type { RateLimiter } from '../util/rate-limit.js';

export interface SessionLifecycleHooks {
  /** Called when an MCP session is initialized — fires once per `initialize`. */
  onSessionStarted?: (sessionId: string) => void;
  /** Called when an MCP session closes (transport.onclose for any reason — DELETE,
   *  unexpected disconnect, transport.close()). The registry uses this to start
   *  the disconnect grace flow. */
  onSessionClosed?: (sessionId: string) => void;
  /** Called after a request with an existing `mcp-session-id` is successfully
   *  dispatched to its live transport. Note: this fires for *every* such
   *  request, not only "reconnect after disconnect". The handler should gate on
   *  whether the session is actually flagged disconnected
   *  (e.g. `registry.isSessionDisconnected(id)`) before doing real work. */
  onSessionResumed?: (sessionId: string) => void;
}

export interface McpHandlerDeps extends SessionLifecycleHooks {
  // Factory invoked to build a fresh McpServer per session. The SDK's invariant
  // (`Already connected to a transport`) means servers can't be shared across
  // transports, so we mint one per session and one per legacy stateless request.
  createServer: () => McpServer;
  logger: Logger;
  writeRateLimiter: RateLimiter;
  ipFromReq: (req: IncomingMessage) => string;
  // Optional EventStore wired into the streamable HTTP transport. When set,
  // the SDK serves `Last-Event-ID` replays on reconnecting GETs, so a transient
  // SSE drop is invisible to both sides and `transport.onclose` only fires on
  // terminal close (DELETE, max-age, hard error). When omitted, the transport
  // does not advertise resumability and SSE drops surface as session_closed.
  eventStore?: EventStore;
}

const WRITE_TOOLS = new Set(['start_work', 'heartbeat', 'complete_work']);

interface JsonRpcCallToolBody {
  method?: string;
  params?: { name?: string; arguments?: { room?: unknown } };
}

function writeRateLimitKeys(body: unknown, ip: string): string[] {
  const calls = Array.isArray(body) ? body : [body];
  const keys: string[] = [];

  for (const call of calls) {
    if (!call || typeof call !== 'object') continue;
    const { method, params } = call as JsonRpcCallToolBody;
    if (method !== 'tools/call') continue;
    if (!WRITE_TOOLS.has(params?.name ?? '')) continue;

    const room = params?.arguments?.room;
    const roomKey = typeof room === 'string' && room.length > 0 ? room.toUpperCase() : 'unknown';
    keys.push(`mcp-write:${ip}:${roomKey}`);
  }

  return keys;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw.length ? JSON.parse(raw) : undefined);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function isInitializeBody(body: unknown): boolean {
  const calls = Array.isArray(body) ? body : [body];
  return calls.some(
    (call) =>
      call !== null &&
      typeof call === 'object' &&
      (call as { method?: string }).method === 'initialize',
  );
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Stateful MCP HTTP handler. Each agent's `initialize` call mints a new
 * `StreamableHTTPServerTransport` keyed by session ID. Subsequent requests are
 * routed to the same transport via the `mcp-session-id` header. Connection
 * teardown surfaces via `transport.onclose` and is forwarded to the registry,
 * which runs the disconnect-grace flow over owned work entries.
 *
 * Falls back to per-request stateless mode for legacy clients that issue tool
 * calls without an `mcp-session-id` header and without an `initialize` body
 * (preserving the old behavior).
 */
function readSessionId(req: IncomingMessage): string | undefined {
  const raw = req.headers['mcp-session-id'];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export function buildMcpHandler(deps: McpHandlerDeps) {
  const sessions = new Map<string, SessionEntry>();

  async function dispatch(
    entry: SessionEntry,
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<boolean> {
    try {
      await entry.transport.handleRequest(req, res, body);
      return true;
    } catch (err) {
      deps.logger.error({ err }, 'mcp handler error');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'internal_error' }));
      }
      return false;
    }
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }

    const ip = deps.ipFromReq(req);
    for (const key of writeRateLimitKeys(body, ip)) {
      const decision = deps.writeRateLimiter.consume(key);
      if (!decision.allowed) {
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Retry-After', String(decision.retryAfterSec));
        res.end(JSON.stringify({ error: 'rate_limited', retry_after_sec: decision.retryAfterSec }));
        return;
      }
    }

    const sessionIdHeader = readSessionId(req);

    // Route to an existing live session.
    if (sessionIdHeader) {
      const existing = sessions.get(sessionIdHeader);
      if (existing) {
        const ok = await dispatch(existing, req, res, body);
        // Fire the hook only when (a) dispatch succeeded and (b) the session
        // is still alive after dispatch. A DELETE request goes through this
        // same path and triggers transport.onclose synchronously inside the
        // SDK, which removes the session from `sessions`. Firing the resume
        // hook on the way out of a DELETE would race with `onSessionClosed`
        // and cancel the disconnect-grace timer that was just armed.
        if (ok && sessions.has(sessionIdHeader)) {
          deps.onSessionResumed?.(sessionIdHeader);
        }
        return;
      }
      // Reject unknown session IDs explicitly. Falling through to the legacy
      // stateless block silently downgrades stale or misrouted clients: the
      // SDK skips session validation entirely when sessionIdGenerator is
      // undefined, so a tools/call would execute against a one-shot transport
      // even though the client thinks it's session-bound. Match the SDK's
      // wire format (404, JSON-RPC error -32001).
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found' },
          id: null,
        }),
      );
      return;
    }

    // Mint a fresh session on initialize.
    if (isInitializeBody(body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore: deps.eventStore,
        onsessioninitialized: (id: string) => {
          sessions.set(id, { transport, server });
          deps.onSessionStarted?.(id);
        },
        onsessionclosed: (id: string) => {
          // Graceful client DELETE — onclose below will also fire and run cleanup.
          deps.logger.info({ event: 'session_deleted', session_id: id }, 'mcp session deleted');
        },
      });
      const server = deps.createServer();
      // Set onclose BEFORE server.connect so the SDK chains us into its own
      // teardown rather than overwriting it. The SDK calls server.close()
      // internally; calling it again here recurses through transport.close.
      // eslint-disable-next-line unicorn/prefer-add-event-listener -- SDK contract uses property setter, not EventTarget
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) {
          sessions.delete(id);
          deps.onSessionClosed?.(id);
        }
      };
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        deps.logger.error({ err }, 'mcp initialize error');
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'internal_error' }));
        }
        void transport.close();
      }
      return;
    }

    // Legacy stateless fallback: one-shot transport + server per request, no
    // session ID. Entries created here use the wall-clock heartbeat-missed path.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = deps.createServer();
    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      deps.logger.error({ err }, 'mcp handler error');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'internal_error' }));
      }
    }
  };
}
