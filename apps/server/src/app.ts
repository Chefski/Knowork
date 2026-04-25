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
import { InMemoryEventStore } from './mcp/event-store.js';
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
    sessionMaxAgeMs: cfg.sessionMaxAgeMs,
    disconnectGraceMs: cfg.disconnectGraceMs,
    sweepIntervalMs: cfg.sweepIntervalMs,
  });

  const writeRateLimiter = new RateLimiter(cfg.rateLimitWritesPerMinute, 60_000);

  // Single shared store across all sessions; SDK keys events by streamId, which
  // is unique per (session, SSE stream) tuple internally.
  const eventStore = new InMemoryEventStore({ bufferPerStream: cfg.sseReplayBufferSize });

  const mcpHandler = buildMcpHandler({
    createServer: () => buildMcpServer({ repo: repository, registry, logger }),
    logger,
    writeRateLimiter,
    ipFromReq: ipFromIncomingMessage,
    eventStore,
    onSessionStarted: (id) =>
      logger.info({ event: 'mcp_session_started', session_id: id }, 'mcp session started'),
    onSessionClosed: (id) => {
      logger.info({ event: 'mcp_session_closed', session_id: id }, 'mcp session closed');
      registry.markSessionDisconnected(id);
    },
    onSessionResumed: (id) => {
      if (registry.isSessionDisconnected(id)) registry.resumeSession(id);
    },
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
