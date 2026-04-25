import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../logger.js';
import type { RateLimiter } from '../util/rate-limit.js';

export interface McpHandlerDeps {
  // Factory invoked per request. Stateless StreamableHTTPServerTransport in the
  // MCP SDK requires a fresh Server per connection — sharing one across requests
  // throws "Already connected to a transport" as soon as two calls overlap and
  // permanently wedges the singleton. See transport.test.ts for proof.
  createServer: () => McpServer;
  logger: Logger;
  writeRateLimiter: RateLimiter;
  ipFromReq: (req: IncomingMessage) => string;
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
    const b = call as JsonRpcCallToolBody;
    if (b.method !== 'tools/call') continue;
    if (!WRITE_TOOLS.has(b.params?.name ?? '')) continue;

    const room = b.params?.arguments?.room;
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

/**
 * Stateless MCP HTTP handler: creates a transport per request, applies write-tool
 * rate limiting before dispatching, and ensures cleanup on connection close.
 */
export function buildMcpHandler(deps: McpHandlerDeps) {
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
