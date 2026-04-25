import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrate.js';
import { Repository } from '../db/repository.js';
import { RoomRegistry } from './registry.js';
import type { ServerEvent } from '@apb/shared';

const ROOM = 'TESTRM';

let now = 1_700_000_000_000;
function clock(): number {
  return now;
}

interface FakeTimer {
  fn: () => void;
  ms: number;
  fired: boolean;
}

describe('RoomRegistry session lifecycle', () => {
  let db: Db;
  let repo: Repository;
  let timers: FakeTimer[];
  let registry: RoomRegistry;

  beforeEach(() => {
    now = 1_700_000_000_000;
    db = openDatabase(':memory:');
    runMigrations(db);
    repo = new Repository(db);
    repo.createRoom(ROOM, now);
    timers = [];
    registry = new RoomRegistry({
      repository: repo,
      disconnectGraceMs: 30_000,
      sessionMaxAgeMs: 24 * 60 * 60 * 1000,
      now: clock,
      setTimer: (fn, ms) => {
        const t: FakeTimer = { fn, ms, fired: false };
        timers.push(t);
        return t as unknown as NodeJS.Timeout;
      },
      clearTimer: (handle) => {
        const idx = timers.indexOf(handle as unknown as FakeTimer);
        if (idx >= 0) timers.splice(idx, 1);
      },
    });
  });

  afterEach(() => {
    registry.stopSweep();
    db.close();
  });

  function fireAll(): void {
    for (const t of timers) {
      if (!t.fired) {
        t.fired = true;
        t.fn();
      }
    }
  }

  it('markSessionDisconnected arms a single grace timer; expiry finalizes entries', async () => {
    const events: ServerEvent[] = [];
    const room = registry.getOrCreate(ROOM);
    room.addSubscriber({ id: 's', send: (e) => events.push(e), close: () => undefined });

    const entry = await room.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
      sessionId: 'sess-1',
    });

    registry.markSessionDisconnected('sess-1');
    expect(timers).toHaveLength(1);
    expect(events.some((e) => e.type === 'work_session_disconnected')).toBe(true);

    fireAll();
    const expired = events.find((e) => e.type === 'work_expired');
    expect(expired).toBeDefined();
    if (expired && expired.type === 'work_expired') {
      expect(expired.reason).toBe('session_closed');
      expect(expired.work_id).toBe(entry.work_id);
    }
    expect(room.listActive()).toHaveLength(0);
  });

  it('resumeSession cancels the grace timer and broadcasts resume', async () => {
    const events: ServerEvent[] = [];
    const room = registry.getOrCreate(ROOM);
    room.addSubscriber({ id: 's', send: (e) => events.push(e), close: () => undefined });

    await room.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
      sessionId: 'sess-r',
    });

    registry.markSessionDisconnected('sess-r');
    expect(timers).toHaveLength(1);
    registry.resumeSession('sess-r');
    expect(timers).toHaveLength(0);

    expect(events.some((e) => e.type === 'work_session_resumed')).toBe(true);
    // Firing remaining timers shouldn't expire anything (none scheduled after cancel).
    fireAll();
    expect(room.listActive()).toHaveLength(1);
  });

  it('marks entries owned by a session across multiple rooms', async () => {
    repo.createRoom('OTHER12345', now);
    const r1 = registry.getOrCreate(ROOM);
    const r2 = registry.getOrCreate('OTHER12345');

    await r1.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'a',
      branch: null,
      intent: 'i',
      files: [],
      sessionId: 'cross',
    });
    await r2.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'b',
      branch: null,
      intent: 'j',
      files: [],
      sessionId: 'cross',
    });

    registry.markSessionDisconnected('cross');
    expect(r1.listActive()[0]!.disconnected_at).toBeTruthy();
    expect(r2.listActive()[0]!.disconnected_at).toBeTruthy();

    fireAll();
    expect(r1.listActive()).toHaveLength(0);
    expect(r2.listActive()).toHaveLength(0);
  });

  it('sweep applies max-age to session-bound entries and heartbeat-missed to legacy', async () => {
    const room = registry.getOrCreate(ROOM);
    await room.startWork({
      agentIdentity: { name: 'session', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
      sessionId: 'sess-old',
    });
    await room.startWork({
      agentIdentity: { name: 'legacy', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'j',
      files: [],
    });

    // Past max-age and past heartbeat window
    now += 25 * 60 * 60 * 1000;
    const expired = registry.sweep();
    expect(expired).toBe(2);
    expect(room.listActive()).toHaveLength(0);
  });

  it('markSessionDisconnected with no owned entries is a no-op (no timer)', () => {
    registry.markSessionDisconnected('unknown-session');
    expect(timers).toHaveLength(0);
  });
});
