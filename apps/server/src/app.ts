import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Hono } from 'hono';
import type { AppConfig } from './config.js';
import type { Db } from './db/sqlite.js';
import { Repository } from './db/repository.js';
import { RoomRegistry } from './registry/registry.js';
import type { Logger } from './logger.js';
import { buildApiRouter } from './http/routes.js';
import { corsMiddleware } from './http/middleware.js';
import { serveStatic } from './http/static.js';
import { buildMcpServer } from './mcp/server.js';
import { buildMcpHandler } from './mcp/transport.js';
import { RateLimiter } from './util/rate-limit.js';
import { clientIp } from './http/middleware.js';
import type { IncomingMessage } from 'node:http';

export interface BuildAppOptions {
  cfg: AppConfig;
  db: Db;
  logger: Logger;
}

export interface BuiltApp {
  hono: Hono;
  registry: RoomRegistry;
  repository: Repository;
  mcpHandler: ReturnType<typeof buildMcpHandler>;
  writeRateLimiter: RateLimiter;
}

export function buildApp(opts: BuildAppOptions): BuiltApp {
  const { cfg, db, logger } = opts;

  const repository = new Repository(db);
  const registry = new RoomRegistry({
    repository,
    expiryMs: cfg.heartbeatExpiryMs,
    sweepIntervalMs: cfg.sweepIntervalMs,
  });

  const writeRateLimiter = new RateLimiter(cfg.rateLimitWritesPerMinute, 60_000);

  const mcpServer = buildMcpServer({ repo: repository, registry, logger });
  const mcpHandler = buildMcpHandler({
    server: mcpServer,
    logger,
    writeRateLimiter,
    ipFromReq: ipFromIncomingMessage,
  });

  const hono = new Hono();
  hono.use('*', corsMiddleware(cfg));

  hono.get('/health', (c) =>
    c.json({ ok: true, version: '0.1.0', demo_banner: cfg.demoBanner }),
  );

  hono.route('/api', buildApiRouter({ cfg, repo: repository, registry, logger }));

  if (cfg.isProduction) {
    const here = dirname(fileURLToPath(import.meta.url));
    const publicDir = join(here, 'public');
    hono.use('*', serveStatic(publicDir));
  }

  return { hono, registry, repository, mcpHandler, writeRateLimiter };
}

function ipFromIncomingMessage(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(',')[0]!.trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.socket.remoteAddress ?? 'unknown';
}

// Re-export for tests
export { clientIp };
