import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { describeConfig, loadConfig } from './config.js';
import { openDatabase } from './db/sqlite.js';
import { runMigrations } from './db/migrate.js';
import { createLogger } from './logger.js';
import { buildApp } from './app.js';
import { WebSocketGateway } from './ws/gateway.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = createLogger(cfg);

  logger.info({ config: describeConfig(cfg) }, 'starting agent-presence-board');

  const db = openDatabase(cfg.dataDir);
  runMigrations(db);

  const built = buildApp({ cfg, db, logger });
  built.registry.startSweep();

  const honoListener = getRequestListener(built.hono.fetch);
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/mcp') {
      void built.mcpHandler(req, res);
      return;
    }
    void honoListener(req, res);
  });

  const wsGateway = new WebSocketGateway({
    cfg,
    repo: built.repository,
    registry: built.registry,
    logger,
  });
  wsGateway.attach(server);

  await new Promise<void>((resolve) => {
    server.listen(cfg.port, '0.0.0.0', () => {
      logger.info({ port: cfg.port }, 'http server listening');
      resolve();
    });
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutdown initiated');
    built.registry.stopSweep();
    await wsGateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    logger.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
