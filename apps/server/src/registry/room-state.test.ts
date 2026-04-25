import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/sqlite.js';
import { runMigrations } from '../db/migrate.js';
import { Repository } from '../db/repository.js';
import { RoomState } from './room-state.js';

const ROOM = 'TESTRM';

let now = 1_700_000_000_000;
function clock(): number {
  return now;
}

describe('RoomState', () => {
  let db: Db;
  let repo: Repository;
  let state: RoomState;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    repo = new Repository(db);
    repo.createRoom(ROOM, now);
    state = new RoomState(ROOM, repo, clock);
  });

  afterEach(() => {
    db.close();
  });

  it('startWork creates an active entry and broadcasts', async () => {
    const events: string[] = [];
    state.addSubscriber({
      id: 's1',
      send: (e) => events.push(e.type),
      close: () => undefined,
    });

    const entry = await state.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: 'main',
      intent: 'refactor auth',
      files: ['src/auth.ts'],
    });

    expect(entry.work_id).toBeTruthy();
    expect(state.listActive()).toHaveLength(1);
    expect(events).toEqual(['work_started']);
  });

  it('heartbeat updates last_seen', async () => {
    const entry = await state.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: null,
      intent: 'x',
      files: [],
    });
    now += 30_000;
    const result = await state.heartbeat(entry.work_id);
    expect(result.status).toBe('ok');
    expect(state.listActive()[0]!.last_seen).toBe(now);
  });

  it('heartbeat returns not_found for unknown work_id', async () => {
    const result = await state.heartbeat('does-not-exist');
    expect(result.status).toBe('not_found');
  });

  it('completeWork removes entry, persists history, broadcasts', async () => {
    const events: string[] = [];
    state.addSubscriber({ id: 's1', send: (e) => events.push(e.type), close: () => undefined });
    const entry = await state.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: null,
      intent: 'x',
      files: [],
    });
    now += 5_000;
    const out = await state.completeWork(entry.work_id, 'done');
    expect(out.status).toBe('completed');
    expect(state.listActive()).toHaveLength(0);
    expect(events).toEqual(['work_started', 'work_completed']);
    const recent = repo.listRecentlyShipped(ROOM, 10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.summary).toBe('done');
    expect(recent[0]!.completion_reason).toBe('completed');
  });

  it('double-complete returns not_found on second call', async () => {
    const entry = await state.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
    });
    const first = await state.completeWork(entry.work_id, null);
    const second = await state.completeWork(entry.work_id, null);
    expect(first.status).toBe('completed');
    expect(second.status).toBe('not_found');
  });

  it('expireStale removes entries older than maxAgeMs and writes history', async () => {
    const events: string[] = [];
    state.addSubscriber({ id: 's1', send: (e) => events.push(e.type), close: () => undefined });
    await state.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
    });
    now += 100_000;
    const expired = state.expireStale(90_000);
    expect(expired).toHaveLength(1);
    expect(expired[0]!.completion_reason).toBe('expired');
    expect(state.listActive()).toHaveLength(0);
    expect(events).toEqual(['work_started', 'work_expired']);
  });

  it('completeWork after expire returns not_found (entry already moved)', async () => {
    const entry = await state.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
    });
    now += 100_000;
    state.expireStale(90_000);
    const out = await state.completeWork(entry.work_id, 'late');
    expect(out.status).toBe('not_found');
  });
});
