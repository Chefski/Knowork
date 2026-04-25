import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { ServerEvent } from '@apb/shared';
import { startTestServer, type TestHarness } from '../src/test/test-server.js';

describe('HTTP + WebSocket integration', () => {
  let h: TestHarness;
  beforeEach(async () => {
    h = await startTestServer();
  });
  afterEach(async () => {
    await h.close();
  });

  it('creates a room, fetches active state, lists history', async () => {
    const create = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    expect(create.status).toBe(200);
    const { code } = (await create.json()) as { code: string };
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const meta = await fetch(`${h.baseUrl}/api/rooms/${code}`);
    expect(meta.status).toBe(200);

    const active = await fetch(`${h.baseUrl}/api/rooms/${code}/active`);
    expect(active.status).toBe(200);
    expect(await active.json()).toEqual({ active: [] });

    const history = await fetch(`${h.baseUrl}/api/rooms/${code}/history`);
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual({ entries: [] });
  });

  it('returns 404 for unknown room', async () => {
    const r = await fetch(`${h.baseUrl}/api/rooms/XXXXXX`);
    expect(r.status).toBe(404);
  });

  it('startWork pushes work_started over WebSocket within 1s', async () => {
    const create = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    const { code } = (await create.json()) as { code: string };

    const ws = new WebSocket(h.wsUrl(code));
    const events: ServerEvent[] = [];
    ws.on('message', (raw) => {
      events.push(JSON.parse(raw.toString()) as ServerEvent);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    // Wait for snapshot
    await waitFor(() => events.some((e) => e.type === 'snapshot'), 1_000);

    const room = h.built.registry.getOrCreate(code);
    await room.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: 'main',
      intent: 'do a thing',
      files: [],
    });

    await waitFor(() => events.some((e) => e.type === 'work_started'), 1_000);

    const startEvent = events.find((e) => e.type === 'work_started');
    expect(startEvent).toBeTruthy();
    if (startEvent && startEvent.type === 'work_started') {
      expect(startEvent.entry.agent_identity.name).toBe('Alice');
    }

    ws.close();
  });

  it('two clients in the same room each see each other via list_active', async () => {
    const create = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    const { code } = (await create.json()) as { code: string };
    const room = h.built.registry.getOrCreate(code);

    await room.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: null,
      intent: 'A',
      files: [],
    });
    await room.startWork({
      agentIdentity: { name: 'Bob', tool: 'Codex' },
      repo: 'org/repo',
      branch: null,
      intent: 'B',
      files: [],
    });

    const r = await fetch(`${h.baseUrl}/api/rooms/${code}/active`);
    const body = (await r.json()) as { active: Array<{ agent_identity: { name: string } }> };
    const names = body.active.map((e) => e.agent_identity.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('expires entries that miss heartbeats and broadcasts work_expired', async () => {
    const create = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    const { code } = (await create.json()) as { code: string };
    const room = h.built.registry.getOrCreate(code);

    const ws = new WebSocket(h.wsUrl(code));
    const events: ServerEvent[] = [];
    ws.on('message', (raw) => events.push(JSON.parse(raw.toString()) as ServerEvent));
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    await room.startWork({
      agentIdentity: { name: 'Alice', tool: 'Claude Code' },
      repo: 'org/repo',
      branch: null,
      intent: 'soon-to-expire',
      files: [],
    });

    // Force last_seen far in the past, then trigger sweep
    const entry = room.listActive()[0]!;
    entry.last_seen = Date.now() - 200_000;
    h.built.registry.sweep();

    await waitFor(() => events.some((e) => e.type === 'work_expired'), 1_000);
    expect(room.listActive()).toHaveLength(0);

    ws.close();
  });

  it('rejects WebSocket upgrade for unknown room', async () => {
    const ws = new WebSocket(h.wsUrl('XXXXXX'));
    await expect(
      new Promise<void>((resolve, reject) => {
        ws.once('open', () => reject(new Error('should not open')));
        ws.once('unexpected-response', () => resolve());
        ws.once('error', () => resolve());
      }),
    ).resolves.toBeUndefined();
  });
});

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}
