import { Hono } from 'hono';
import { RoomCodeSchema } from '@apb/shared';
import type { AppConfig } from '../config.js';
import type { Repository } from '../db/repository.js';
import type { RoomRegistry } from '../registry/registry.js';
import type { Logger } from '../logger.js';
import { RateLimiter } from '../util/rate-limit.js';
import { generateRoomCode } from '../util/room-code.js';
import { clientIp, rateLimit } from './middleware.js';

export interface RouteDeps {
  cfg: AppConfig;
  repo: Repository;
  registry: RoomRegistry;
  logger: Logger;
}

const MAX_ROOM_CREATE_ATTEMPTS = 8;

export function buildApiRouter(deps: RouteDeps): Hono {
  const { cfg, repo, registry } = deps;

  const roomCreateLimiter = new RateLimiter(cfg.rateLimitRoomsPerHour, 60 * 60 * 1_000);

  const api = new Hono();

  api.post('/rooms', rateLimit(roomCreateLimiter, (c) => `rooms:${clientIp(c)}`), (c) => {
    let code: string | null = null;
    for (let attempt = 0; attempt < MAX_ROOM_CREATE_ATTEMPTS; attempt++) {
      const candidate = generateRoomCode();
      if (!repo.getRoom(candidate)) {
        repo.createRoom(candidate);
        code = candidate;
        break;
      }
    }
    if (!code) {
      return c.json({ error: 'room_code_generation_failed' }, 500);
    }
    deps.logger.info({ event: 'room_created', code }, 'room created');
    return c.json({ code });
  });

  api.get('/rooms/:code', (c) => {
    const parsed = RoomCodeSchema.safeParse(c.req.param('code'));
    if (!parsed.success) return c.json({ error: 'invalid_room_code' }, 400);
    const room = repo.getRoom(parsed.data);
    if (!room) return c.json({ error: 'room_not_found' }, 404);
    return c.json({
      code: room.code,
      created_at: room.created_at,
      last_active_at: room.last_active_at,
    });
  });

  api.get('/rooms/:code/active', (c) => {
    const parsed = RoomCodeSchema.safeParse(c.req.param('code'));
    if (!parsed.success) return c.json({ error: 'invalid_room_code' }, 400);
    const room = repo.getRoom(parsed.data);
    if (!room) return c.json({ error: 'room_not_found' }, 404);
    const state = registry.getOrCreate(parsed.data);
    return c.json({ active: state.listActive() });
  });

  api.get('/rooms/:code/history', (c) => {
    const parsed = RoomCodeSchema.safeParse(c.req.param('code'));
    if (!parsed.success) return c.json({ error: 'invalid_room_code' }, 400);
    const room = repo.getRoom(parsed.data);
    if (!room) return c.json({ error: 'room_not_found' }, 404);
    const limitRaw = c.req.query('limit');
    const limit = Math.min(
      Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : cfg.historyLimit,
      cfg.historyLimit,
    );
    const entries = repo.listRecentlyShipped(parsed.data, limit);
    return c.json({ entries });
  });

  return api;
}
