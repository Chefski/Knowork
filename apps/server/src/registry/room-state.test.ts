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

  it('double-complete returns already_completed on second call', async () => {
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
    expect(second.status).toBe('already_completed');
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

  it('completeWork after expire records expired_then_completed', async () => {
    const events: string[] = [];
    state.addSubscriber({ id: 's1', send: (e) => events.push(e.type), close: () => undefined });
    const entry = await state.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
    });
    now += 100_000;
    state.expireStale(90_000);
    now += 1_000;
    const out = await state.completeWork(entry.work_id, 'late');
    expect(out.status).toBe('completed');
    if (out.status === 'completed') {
      expect(out.entry.completion_reason).toBe('expired_then_completed');
      expect(out.entry.summary).toBe('late');
    }
    expect(events).toEqual(['work_started', 'work_expired', 'work_completed']);
    const recent = repo.listRecentlyShipped(ROOM, 10);
    expect(recent).toHaveLength(1);
    expect(recent[0]!.completion_reason).toBe('expired_then_completed');
    expect(recent[0]!.summary).toBe('late');
  });

  it('completeWork after a fully completed entry returns already_completed', async () => {
    const entry = await state.startWork({
      agentIdentity: { name: 'A', tool: 'T' },
      repo: 'r',
      branch: null,
      intent: 'i',
      files: [],
    });
    await state.completeWork(entry.work_id, 'first');
    const out = await state.completeWork(entry.work_id, 'second');
    expect(out.status).toBe('already_completed');
  });

  describe('session ownership', () => {
    it('startWork records the calling sessionId and indexes the entry', async () => {
      const entry = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'session-1',
      });
      expect(state.hasSession('session-1')).toBe(true);
      // Entry payload itself does not carry session_id (server-internal only).
      expect((entry as unknown as { session_id?: unknown }).session_id).toBeUndefined();
    });

    it('legacy entries (no sessionId) are tracked outside the ownership index', async () => {
      await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
      });
      expect(state.hasSession('session-anywhere')).toBe(false);
    });

    it('completeWork removes the entry from the session ownership index', async () => {
      const entry = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'session-x',
      });
      await state.completeWork(entry.work_id, null);
      expect(state.hasSession('session-x')).toBe(false);
    });
  });

  describe('disconnect / resume flow', () => {
    it('markEntriesDisconnected flags owned entries and broadcasts', async () => {
      const events: Array<{ type: string; work_id?: string }> = [];
      state.addSubscriber({
        id: 's1',
        send: (e) => events.push(e as { type: string; work_id?: string }),
        close: () => undefined,
      });
      const a = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });
      await state.startWork({
        agentIdentity: { name: 'B', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'j',
        files: [],
        sessionId: 'other',
      });

      now += 1_000;
      const flagged = state.markEntriesDisconnected('sess', now);
      expect(flagged).toBe(1);

      const disconnected = events.filter((e) => e.type === 'work_session_disconnected');
      expect(disconnected).toHaveLength(1);
      expect(disconnected[0]!.work_id).toBe(a.work_id);

      const flaggedEntry = state.listActive().find((e) => e.work_id === a.work_id);
      expect(flaggedEntry?.disconnected_at).toBe(now);
    });

    it('resumeEntries clears the flag and broadcasts work_session_resumed', async () => {
      const events: string[] = [];
      state.addSubscriber({ id: 's1', send: (e) => events.push(e.type), close: () => undefined });
      const e = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });

      state.markEntriesDisconnected('sess');
      now += 5_000;
      const resumed = state.resumeEntries('sess', now);
      expect(resumed).toBe(1);
      expect(events).toContain('work_session_resumed');
      const entry = state.listActive().find((x) => x.work_id === e.work_id);
      expect(entry?.disconnected_at).toBeNull();
    });

    it('finalizeDisconnectedSession finalizes still-disconnected entries as session_closed', async () => {
      const events: Array<{ type: string; reason?: string }> = [];
      state.addSubscriber({
        id: 's1',
        send: (e) => events.push(e as { type: string; reason?: string }),
        close: () => undefined,
      });
      const e = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });
      state.markEntriesDisconnected('sess');

      now += 30_000;
      const finalized = state.finalizeDisconnectedSession('sess');
      expect(finalized).toHaveLength(1);
      expect(finalized[0]!.work_id).toBe(e.work_id);
      expect(finalized[0]!.completion_reason).toBe('session_closed');
      expect(state.listActive()).toHaveLength(0);
      const expiredEvent = events.find((x) => x.type === 'work_expired');
      expect(expiredEvent?.reason).toBe('session_closed');

      const recent = repo.listRecentlyShipped(ROOM, 10);
      expect(recent[0]!.completion_reason).toBe('session_closed');
    });

    it('finalizeDisconnectedSession skips entries that resumed before the timer fired', async () => {
      const e = await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });
      state.markEntriesDisconnected('sess');
      state.resumeEntries('sess');

      const finalized = state.finalizeDisconnectedSession('sess');
      expect(finalized).toHaveLength(0);
      expect(state.listActive().some((x) => x.work_id === e.work_id)).toBe(true);
    });
  });

  describe('expiration paths', () => {
    it('expireMaxAge finalizes entries past the started_at cap as session_max_age', async () => {
      const events: Array<{ type: string; reason?: string }> = [];
      state.addSubscriber({
        id: 's1',
        send: (e) => events.push(e as { type: string; reason?: string }),
        close: () => undefined,
      });
      await state.startWork({
        agentIdentity: { name: 'A', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });
      now += 25 * 60 * 60 * 1000; // 25h later
      const finalized = state.expireMaxAge(24 * 60 * 60 * 1000);
      expect(finalized).toHaveLength(1);
      expect(finalized[0]!.completion_reason).toBe('session_max_age');
      const expired = events.find((x) => x.type === 'work_expired');
      expect(expired?.reason).toBe('session_max_age');
    });

    it('expireStale skips session-bound entries (legacy path only)', async () => {
      await state.startWork({
        agentIdentity: { name: 'session', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
        sessionId: 'sess',
      });
      await state.startWork({
        agentIdentity: { name: 'legacy', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'j',
        files: [],
      });

      now += 100_000;
      const expired = state.expireStale(90_000);
      expect(expired).toHaveLength(1);
      expect(expired[0]!.agent_identity.name).toBe('legacy');
      expect(state.listActive()).toHaveLength(1);
      expect(state.listActive()[0]!.agent_identity.name).toBe('session');
    });

    it('legacy heartbeat-missed expiration broadcasts reason: heartbeat_missed', async () => {
      const events: Array<{ type: string; reason?: string }> = [];
      state.addSubscriber({
        id: 's1',
        send: (e) => events.push(e as { type: string; reason?: string }),
        close: () => undefined,
      });
      await state.startWork({
        agentIdentity: { name: 'legacy', tool: 'T' },
        repo: 'r',
        branch: null,
        intent: 'i',
        files: [],
      });
      now += 100_000;
      state.expireStale(90_000);
      const expired = events.find((x) => x.type === 'work_expired');
      expect(expired?.reason).toBe('heartbeat_missed');
    });
  });
});
