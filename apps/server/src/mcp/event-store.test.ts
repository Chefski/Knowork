import { describe, expect, it } from 'vitest';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from './event-store.js';

function msg(id: number): JSONRPCMessage {
  return { jsonrpc: '2.0', id, method: 'ping' };
}

describe('InMemoryEventStore', () => {
  it('storeEvent returns an event id whose stream id matches via getStreamIdForEventId', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 10, maxStreams: 100 });
    const eid = await store.storeEvent('streamA', msg(1));
    expect(typeof eid).toBe('string');
    expect(await store.getStreamIdForEventId(eid)).toBe('streamA');
  });

  it('replayEventsAfter sends only events strictly after the given id, in order', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 10, maxStreams: 100 });
    const e1 = await store.storeEvent('s', msg(1));
    await store.storeEvent('s', msg(2));
    await store.storeEvent('s', msg(3));

    const sent: Array<{ id: string; m: JSONRPCMessage }> = [];
    const sid = await store.replayEventsAfter(e1, {
      send: async (id: string, m: JSONRPCMessage) => {
        sent.push({ id, m });
      },
    });

    expect(sid).toBe('s');
    expect(sent.map((x) => (x.m as { id?: number }).id)).toEqual([2, 3]);
  });

  it('does not replay events from other streams', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 10, maxStreams: 100 });
    const eA = await store.storeEvent('A', msg(1));
    await store.storeEvent('B', msg(99));
    await store.storeEvent('A', msg(2));

    const sent: number[] = [];
    await store.replayEventsAfter(eA, {
      send: async (_id: string, m: JSONRPCMessage) => {
        sent.push((m as { id: number }).id);
      },
    });
    expect(sent).toEqual([2]);
  });

  it('evicts oldest events per stream when buffer cap is reached', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 3, maxStreams: 100 });
    const e1 = await store.storeEvent('s', msg(1));
    await store.storeEvent('s', msg(2));
    await store.storeEvent('s', msg(3));
    await store.storeEvent('s', msg(4));

    // Even though the event itself was evicted, the stream still exists, so
    // getStreamIdForEventId resolves the prefix and the SDK can proceed to
    // replayEventsAfter — otherwise the SDK 400s before reaching it.
    expect(await store.getStreamIdForEventId(e1)).toBe('s');

    const sent: number[] = [];
    const sid = await store.replayEventsAfter(e1, {
      send: async (_id: string, m: JSONRPCMessage) => {
        sent.push((m as { id: number }).id);
      },
    });
    expect(sid).toBe('s');
    // Evicted last-event-id: SDK contract says return the streamId; we replay
    // everything currently in the buffer for that stream.
    expect(sent).toEqual([2, 3, 4]);
  });

  it('returns undefined stream id for a totally unknown event id', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 10, maxStreams: 100 });
    expect(await store.getStreamIdForEventId('does-not-exist')).toBeUndefined();
  });

  it('event ids are unique across stores even with the same seq', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 10, maxStreams: 100 });
    const a = await store.storeEvent('x', msg(1));
    const b = await store.storeEvent('x', msg(1));
    expect(a).not.toBe(b);
  });

  it('evicts the least-recently-written stream when maxStreams is exceeded', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 5, maxStreams: 2 });
    const eA = await store.storeEvent('A', msg(1));
    await store.storeEvent('B', msg(2));
    // C arrives — A is the LRU stream and must be dropped in full, including
    // every entry it owns in `index`. Otherwise streams/index leak proportional
    // to cumulative POST count rather than active sessions.
    await store.storeEvent('C', msg(3));

    expect(await store.getStreamIdForEventId(eA)).toBeUndefined();
    // B and C remain — both their indexed lookup AND a parsed-prefix lookup
    // (synthetic event id) should resolve.
    expect(await store.getStreamIdForEventId('B:99')).toBe('B');
    expect(await store.getStreamIdForEventId('C:99')).toBe('C');
  });

  it('storeEvent on an existing stream refreshes its LRU position', async () => {
    const store = new InMemoryEventStore({ bufferPerStream: 5, maxStreams: 2 });
    const eA = await store.storeEvent('A', msg(1));
    await store.storeEvent('B', msg(2));
    // Touch A — now B is the LRU and should be the one evicted next.
    await store.storeEvent('A', msg(3));
    await store.storeEvent('C', msg(4));

    expect(await store.getStreamIdForEventId(eA)).toBe('A');
    expect(await store.getStreamIdForEventId('B:99')).toBeUndefined();
  });

  it('rejects non-positive maxStreams', () => {
    expect(() => new InMemoryEventStore({ bufferPerStream: 5, maxStreams: 0 })).toThrow(
      /maxStreams/,
    );
  });
});
