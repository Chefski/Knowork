import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerEvent } from '@apb/shared';
import { startTestServer, type TestHarness } from '../src/test/test-server.js';

function initBody(id: number) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    },
  };
}

describe('MCP stateful session presence', () => {
  let h: TestHarness;
  beforeEach(async () => {
    // Very short grace so the timer fires within the test window.
    process.env.DISCONNECT_GRACE_MS = '50';
    h = await startTestServer();
  });
  afterEach(async () => {
    delete process.env.DISCONNECT_GRACE_MS;
    await h.close();
  });

  async function createRoom(): Promise<string> {
    const res = await fetch(`${h.baseUrl}/api/rooms`, { method: 'POST' });
    const body = (await res.json()) as { code: string };
    return body.code;
  }

  async function initSession(): Promise<string> {
    const res = await fetch(`${h.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initBody(1)),
    });
    const sessionId = res.headers.get('mcp-session-id');
    if (!sessionId) throw new Error('no session id in initialize response');
    // Drain response body to release the stream.
    await res.text();
    return sessionId;
  }

  async function startWork(sessionId: string, roomCode: string): Promise<string> {
    const res = await fetch(`${h.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'start_work',
          arguments: {
            room: roomCode,
            agent_identity: { name: 'Alice', tool: 'Claude Code' },
            repo: 'org/repo',
            intent: 'do a thing',
          },
        },
      }),
    });
    const text = await res.text();
    // The work_id is in the structuredContent; parse from SSE/JSON.
    const match = text.match(/"work_id"\s*:\s*"([^"]+)"/);
    if (!match) throw new Error(`could not extract work_id from response: ${text}`);
    return match[1]!;
  }

  function captureEvents(roomCode: string): ServerEvent[] {
    const events: ServerEvent[] = [];
    const room = h.built.registry.getOrCreate(roomCode);
    room.addSubscriber({
      id: 'capture',
      send: (e) => events.push(e),
      close: () => undefined,
    });
    return events;
  }

  it('initialize → start_work → DELETE → grace → work_expired with reason: session_closed', async () => {
    const roomCode = await createRoom();
    const sessionId = await initSession();
    const events = captureEvents(roomCode);

    const workId = await startWork(sessionId, roomCode);
    expect(events.some((e) => e.type === 'work_started')).toBe(true);

    const del = await fetch(`${h.baseUrl}/mcp`, {
      method: 'DELETE',
      headers: { 'mcp-session-id': sessionId },
    });
    expect([200, 204]).toContain(del.status);

    // Wait long enough for onclose → markSessionDisconnected to fire and the
    // grace timer (50ms) to expire.
    await new Promise((r) => setTimeout(r, 200));

    const disconnect = events.find(
      (e) => e.type === 'work_session_disconnected' && e.work_id === workId,
    );
    expect(disconnect).toBeDefined();

    const expired = events.find((e) => e.type === 'work_expired' && e.work_id === workId);
    expect(expired).toBeDefined();
    if (expired && expired.type === 'work_expired') {
      expect(expired.reason).toBe('session_closed');
    }
  });

  it('reconnect-within-grace via registry.resumeSession cancels expiration', async () => {
    // The transport-level resume on a fresh connection with the same sessionId is
    // not supported by the SDK without re-initialization. The registry-level
    // resume is what ensures spec-compliant behavior; we exercise it directly
    // here as a contract test of the disconnect/grace/resume API surface.
    const roomCode = await createRoom();
    const sessionId = await initSession();
    const events = captureEvents(roomCode);
    const workId = await startWork(sessionId, roomCode);

    h.built.registry.markSessionDisconnected(sessionId);
    expect(
      events.some((e) => e.type === 'work_session_disconnected' && e.work_id === workId),
    ).toBe(true);

    h.built.registry.resumeSession(sessionId);
    expect(
      events.some((e) => e.type === 'work_session_resumed' && e.work_id === workId),
    ).toBe(true);

    await new Promise((r) => setTimeout(r, 200));
    const expired = events.find((e) => e.type === 'work_expired' && e.work_id === workId);
    expect(expired).toBeUndefined();

    const room = h.built.registry.getOrCreate(roomCode);
    expect(room.listActive().some((e) => e.work_id === workId)).toBe(true);
  });
});
