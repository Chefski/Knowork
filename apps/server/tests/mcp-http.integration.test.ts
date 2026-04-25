import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/db/sqlite.js';
import { runMigrations } from '../src/db/migrate.js';
import { Repository } from '../src/db/repository.js';
import { RoomRegistry } from '../src/registry/registry.js';
import { createLogger } from '../src/logger.js';
import { loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/util/rate-limit.js';
import { buildMcpServer } from '../src/mcp/server.js';
import { buildMcpHandler } from '../src/mcp/transport.js';
import { startTestServer, type TestHarness } from '../src/test/test-server.js';

describe('MCP HTTP transport', () => {
  let h: TestHarness;
  beforeEach(async () => {
    h = await startTestServer();
  });
  afterEach(async () => {
    await h.close();
  });

  async function mcp(body: unknown): Promise<{ status: number; text: string }> {
    const res = await fetch(`${h.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }

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

  it('responds 200 to two sequential initialize requests', async () => {
    const first = await mcp(initBody(1));
    expect(first.status).toBe(200);

    const second = await mcp(initBody(2));
    expect(second.status).toBe(200);
  });

  it('responds 200 to many concurrent initialize requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => mcp(initBody(i + 1))),
    );
    const failed = results.filter((r) => r.status !== 200);
    expect(failed).toHaveLength(0);
  });

  it('keeps responding 200 after a burst of concurrent requests', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => mcp(initBody(i + 1))));
    const tail = await mcp(initBody(99));
    expect(tail.status).toBe(200);
  });

  it('responds 200 to a tools/list call after initialize', async () => {
    const init = await mcp(initBody(1));
    expect(init.status).toBe(200);

    const list = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(list.status).toBe(200);
    expect(list.text).toContain('check_overlap');
    expect(list.text).toContain('start_work');
  });

  it('invokes createServer once per /mcp request (no shared singleton)', async () => {
    process.env.DATA_DIR = ':memory:';
    process.env.LOG_LEVEL = 'fatal';
    const cfg = loadConfig();
    const logger = createLogger(cfg);
    const db = openDatabase(':memory:');
    runMigrations(db);
    const repo = new Repository(db);
    const registry = new RoomRegistry({ repository: repo });
    const writeRateLimiter = new RateLimiter(60, 60_000);

    const createServer = vi.fn(() => buildMcpServer({ repo, registry, logger }));
    const handler = buildMcpHandler({
      createServer,
      logger,
      writeRateLimiter,
      ipFromReq: () => '127.0.0.1',
    });

    // Stand up a tiny http server bound to this handler.
    const { createServer: httpCreateServer } = await import('node:http');
    const srv = httpCreateServer((req, res) => void handler(req, res));
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const addr = srv.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const N = 5;
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          fetch(`${baseUrl}/mcp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify(initBody(i + 1)),
          }),
        ),
      );
      expect(createServer).toHaveBeenCalledTimes(N);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      db.close();
    }
  });

  it('end-to-end: start_work via MCP records an active entry visible over REST', async () => {
    const create = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    const { code } = (await create.json()) as { code: string };

    await mcp(initBody(1));
    const start = await mcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'start_work',
        arguments: {
          room: code,
          agent_identity: { name: 'Alice', tool: 'Claude Code' },
          repo: 'org/repo',
          intent: 'do a thing',
        },
      },
    });
    expect(start.status).toBe(200);
    expect(start.text).toContain('Started work');

    const active = await fetch(`${h.baseUrl}/api/rooms/${code}/active`);
    const body = (await active.json()) as {
      active: Array<{ agent_identity: { name: string } }>;
    };
    expect(body.active).toHaveLength(1);
    expect(body.active[0]!.agent_identity.name).toBe('Alice');
  });
});
