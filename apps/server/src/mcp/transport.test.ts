import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { KNOWORK_PROTOCOL_TEXT } from '@apb/shared';
import { buildMcpServer } from './server.js';
import { buildMcpHandler } from './transport.js';
import type { Repository } from '../db/repository.js';
import type { RoomRegistry } from '../registry/registry.js';
import type { Logger } from '../logger.js';
import { RateLimiter } from '../util/rate-limit.js';
import { createLogger } from '../logger.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/sqlite.js';
import { runMigrations } from '../db/migrate.js';
import { Repository as RepoCtor } from '../db/repository.js';
import { RoomRegistry as RegistryCtor } from '../registry/registry.js';

describe('@modelcontextprotocol/sdk transport invariants', () => {
  it('McpServer.connect throws if reused without close (singleton hazard)', async () => {
    // Documents why buildMcpHandler must mint one McpServer per session/transport.
    const server = new McpServer({ name: 'x', version: '1' });
    const t1 = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const t2 = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(t1);
    await expect(server.connect(t2)).rejects.toThrow(/Already connected/);
  });
});

describe('buildMcpServer initialize handshake', () => {
  it('advertises KNOWORK_PROTOCOL_TEXT as the server `instructions` field', async () => {
    const stubLogger: Logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      trace: () => {},
      fatal: () => {},
      child: () => stubLogger,
    } as unknown as Logger;
    const stubRepo = { getRoom: () => null } as unknown as Repository;
    const stubRegistry = {
      getOrCreate: () => {
        throw new Error('not used in initialize');
      },
    } as unknown as RoomRegistry;

    const server = buildMcpServer({ repo: stubRepo, registry: stubRegistry, logger: stubLogger });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const instructions = client.getInstructions();
    expect(instructions).toBeTypeOf('string');
    expect(instructions).toBe(KNOWORK_PROTOCOL_TEXT);
    expect(instructions).toMatch(/check_overlap/);
    expect(instructions).toMatch(/start_work/);
    expect(instructions).toMatch(/complete_work/);
    expect(instructions).not.toMatch(/heartbeat\(/);

    await client.close();
    await server.close();
  });
});

describe('buildMcpHandler stateful session routing', () => {
  let server: Server;
  let baseUrl: string;
  let onSessionStarted: ReturnType<typeof vi.fn>;
  let onSessionClosed: ReturnType<typeof vi.fn>;
  let onSessionResumed: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env.DATA_DIR = ':memory:';
    process.env.LOG_LEVEL = 'fatal';
    const cfg = loadConfig();
    const logger = createLogger(cfg);
    const db = openDatabase(':memory:');
    runMigrations(db);
    const repo = new RepoCtor(db);
    const registry = new RegistryCtor({ repository: repo });
    onSessionStarted = vi.fn();
    onSessionClosed = vi.fn();
    onSessionResumed = vi.fn();

    const handler = buildMcpHandler({
      createServer: () => buildMcpServer({ repo, registry, logger }),
      logger,
      writeRateLimiter: new RateLimiter(60, 60_000),
      ipFromReq: () => '127.0.0.1',
      onSessionStarted,
      onSessionClosed,
      onSessionResumed,
    });

    server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function initBody(id: number) {
    return {
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    };
  }

  it('initialize returns mcp-session-id and onSessionStarted fires', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(onSessionStarted).toHaveBeenCalledWith(sessionId);
  });

  it('subsequent request with mcp-session-id routes to the same transport (resumed)', async () => {
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    const sessionId = init.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();

    const list = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    expect(list.status).toBe(200);
    expect(onSessionResumed).toHaveBeenCalledWith(sessionId);
  });

  it('DELETE does not fire onSessionResumed (would race the disconnect-grace timer)', async () => {
    // Regression for a race we hit: the routed-request path runs `dispatch`
    // and then fires `onSessionResumed`. A DELETE goes through the same
    // path; transport.onclose fires synchronously *inside* dispatch, arming
    // the disconnect-grace timer. If `onSessionResumed` fires after dispatch
    // returns it cancels the timer and the work entry never expires.
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    const sessionId = init.headers.get('mcp-session-id')!;
    onSessionResumed.mockClear();

    await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(onSessionClosed).toHaveBeenCalledWith(sessionId);
    expect(onSessionResumed).not.toHaveBeenCalled();
  });

  it('DELETE /mcp with session id closes the transport and onSessionClosed fires', async () => {
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    const sessionId = init.headers.get('mcp-session-id')!;

    const del = await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });
    // DELETE may return 200 or 204 depending on SDK.
    expect([200, 204]).toContain(del.status);

    // Allow onclose to flush
    await new Promise((r) => setTimeout(r, 20));
    expect(onSessionClosed).toHaveBeenCalledWith(sessionId);
  });

  it('unknown mcp-session-id returns 404 (no silent stateless fallthrough)', async () => {
    // Regression for the silent-downgrade hazard: when a request arrives with
    // an mcp-session-id we don't recognise, we must NOT fall through to the
    // legacy stateless block — the SDK skips session validation entirely when
    // sessionIdGenerator is undefined, so a tools/call would execute without
    // the client realising its session was gone. Match the SDK's wire format
    // (404, JSON-RPC error -32001 'Session not found').
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': 'not-a-real-session-id',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { jsonrpc?: string; error?: { code?: number } };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error?.code).toBe(-32001);
    expect(onSessionResumed).not.toHaveBeenCalled();
  });

  it('after DELETE the session id is no longer routable (locks SDK DELETE→onclose contract)', async () => {
    // Pins the SDK invariant our disconnect-grace flow depends on: DELETE
    // must trigger transport.onclose (which clears the session from our map)
    // — otherwise we'd leak orphan sessions and onSessionClosed would never
    // fire. If a future SDK upgrade routes DELETE through onsessionclosed
    // only (without firing onclose), the follow-up POST below would still
    // hit `onSessionResumed` and this assertion would fail loudly.
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    const sessionId = init.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();

    await fetch(`${baseUrl}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(onSessionClosed).toHaveBeenCalledWith(sessionId);
    onSessionResumed.mockClear();

    // Follow-up request with the now-defunct session id must NOT be routed
    // to a live transport — onSessionResumed fires only on successful routing
    // to an existing session in the map.
    await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }),
    });
    expect(onSessionResumed).not.toHaveBeenCalled();
  });
});
