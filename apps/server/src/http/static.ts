import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { MiddlewareHandler } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export function serveStatic(rootDir: string): MiddlewareHandler {
  const root = resolve(rootDir);
  const indexPath = join(root, 'index.html');

  return async (c, next) => {
    const url = new URL(c.req.url);
    const requested = decodeURIComponent(url.pathname);

    if (requested.startsWith('/api/') || requested.startsWith('/mcp') || requested.startsWith('/ws/')) {
      return next();
    }

    const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
    const relative = safe === '/' ? '/index.html' : safe;
    const candidate = resolve(root, '.' + relative);
    if (!candidate.startsWith(root)) {
      return c.text('forbidden', 403);
    }

    if (existsSync(candidate)) {
      const body = readFileSync(candidate);
      const type = MIME[extname(candidate).toLowerCase()] ?? 'application/octet-stream';
      return c.body(body, 200, { 'Content-Type': type });
    }

    if (existsSync(indexPath)) {
      const body = readFileSync(indexPath);
      return c.body(body, 200, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    return next();
  };
}
