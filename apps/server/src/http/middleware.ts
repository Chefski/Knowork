import type { IncomingMessage } from 'node:http';
import type { Context, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { AppConfig } from '../config.js';
import type { RateLimiter } from '../util/rate-limit.js';

export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  // Fallback for direct Node deployments without a forwarding proxy.
  // @hono/node-server exposes the raw IncomingMessage as c.env.incoming.
  const incoming = (c.env as { incoming?: IncomingMessage } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

export function rateLimit(limiter: RateLimiter, keyFn: (c: Context) => string): MiddlewareHandler {
  return async (c, next) => {
    const key = keyFn(c);
    const result = limiter.consume(key);
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSec));
      return c.json({ error: 'rate_limited', retry_after_sec: result.retryAfterSec }, 429);
    }
    return next();
  };
}

export function corsMiddleware(cfg: AppConfig): MiddlewareHandler {
  return cors({
    origin: cfg.isProduction ? cfg.corsOrigin : (origin) => origin ?? '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Room-Code'],
    credentials: false,
  });
}
