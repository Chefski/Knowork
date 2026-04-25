import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

/**
 * Parses SSE event ids from a raw SSE response body. Each event block is
 *   id: <id>
 *   data: <json>
 *
 * separated by a blank line. We only care about the ids for the replay test.
 */
function parseSseEventIds(body: string): string[] {
  const ids: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^id:\s*(.+)$/);
    if (m && m[1]) ids.push(m[1].trim());
  }
  return ids;
}

describe('MCP SSE replay via EventStore', () => {
  let h: TestHarness;
  beforeEach(async () => {
    h = await startTestServer();
  });
  afterEach(async () => {
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
    await res.text();
    return sessionId;
  }

  async function callStartWork(sessionId: string, roomCode: string, jsonRpcId: number) {
    return fetch(`${h.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: jsonRpcId,
        method: 'tools/call',
        params: {
          name: 'start_work',
          arguments: {
            room: roomCode,
            agent_identity: { name: 'Alice', tool: 'Claude Code' },
            repo: 'org/repo',
            intent: `task ${jsonRpcId}`,
          },
        },
      }),
    });
  }

  it('tool-call SSE responses carry event ids (eventStore is wired into the transport)', async () => {
    const roomCode = await createRoom();
    const sessionId = await initSession();
    const res = await callStartWork(sessionId, roomCode, 2);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    const ids = parseSseEventIds(body);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('GET /mcp with an unknown Last-Event-ID is rejected as 400 (proves SDK is using the store)', async () => {
    // With a wired EventStore that implements getStreamIdForEventId, the SDK
    // returns 400 for an unknown event id rather than the generic 400
    // "Event store not configured". Same status, different proof: the request
    // reaches our store and we report the id as unknown. If the eventStore
    // were NOT wired, the SDK would also 400 — but with the message
    // "Event store not configured". We assert the body to disambiguate.
    const sessionId = await initSession();
    const res = await fetch(`${h.baseUrl}/mcp`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'mcp-session-id': sessionId,
        'last-event-id': 'totally-bogus:999',
      },
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('Invalid event ID format');
    expect(body).not.toContain('Event store not configured');
  });

  it('GET /mcp with a real Last-Event-ID is accepted and resumes the stream', async () => {
    // Capture a real event id from a tool-call SSE response, then ask the
    // server to resume from it. The SDK should open a 200 SSE response and
    // (since nothing newer has been emitted on that stream) close it cleanly.
    const roomCode = await createRoom();
    const sessionId = await initSession();
    const callRes = await callStartWork(sessionId, roomCode, 2);
    const callBody = await callRes.text();
    const ids = parseSseEventIds(callBody);
    expect(ids.length).toBeGreaterThan(0);
    const lastEventId = ids[ids.length - 1]!;

    const res = await fetch(`${h.baseUrl}/mcp`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'mcp-session-id': sessionId,
        'last-event-id': lastEventId,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Drain so the server-side stream closes cleanly before teardown.
    await res.body?.cancel();
  });
});
