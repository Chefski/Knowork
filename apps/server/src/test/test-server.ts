import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getRequestListener } from '@hono/node-server';
import { openDatabase, type Db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrate.js';
import { buildApp, type BuiltApp } from '../app.js';
import { WebSocketGateway } from '../ws/gateway.js';
import { createLogger } from '../logger.js';
import { loadConfig } from '../config.js';

export interface TestHarness {
  port: number;
  baseUrl: string;
  wsUrl(code: string): string;
  built: BuiltApp;
  db: Db;
  server: Server;
  gateway: WebSocketGateway;
  close(): Promise<void>;
}

export async function startTestServer(): Promise<TestHarness> {
  process.env.DATA_DIR = ':memory:';
  process.env.PORT = '0';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'fatal';
  process.env.HEARTBEAT_EXPIRY_MS ??= '90000';
  process.env.SWEEP_INTERVAL_MS ??= '15000';

  const cfg = loadConfig();
  const logger = createLogger(cfg);
  const db = openDatabase(':memory:');
  runMigrations(db);
  const built = buildApp({ cfg, db, logger });

  const honoListener = getRequestListener(built.hono.fetch);
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/mcp') {
      void built.mcpHandler(req, res);
      return;
    }
    void honoListener(req, res);
  });

  const gateway = new WebSocketGateway({
    cfg,
    repo: built.repository,
    registry: built.registry,
    logger,
  });
  gateway.attach(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  const port = addr.port;

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    wsUrl: (code) => `ws://127.0.0.1:${port}/ws/${code}`,
    built,
    db,
    server,
    gateway,
    async close() {
      built.registry.stopSweep();
      await gateway.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
