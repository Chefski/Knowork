import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type {
  EventStore,
  EventId,
  StreamId,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';

interface StoredEvent {
  eventId: EventId;
  message: JSONRPCMessage;
}

export interface InMemoryEventStoreOptions {
  /** Hard cap on events retained per stream. Older events are evicted on overflow. */
  bufferPerStream: number;
}

/**
 * Per-process, in-memory implementation of the SDK's `EventStore` interface.
 *
 * Used by `StreamableHTTPServerTransport` to support `Last-Event-ID` SSE
 * resumption: when a client's GET stream drops and they reconnect with the
 * last event id they received, the SDK calls `replayEventsAfter` to push the
 * missed events down the new stream. This makes transient SSE drops invisible
 * to both ends and keeps `transport.onclose` reserved for terminal closes
 * (DELETE, max-age, hard error) — which is what the registry's session-grace
 * flow expects.
 *
 * Single-process only. Behind a load balancer, sticky-route on
 * `mcp-session-id` (and accept that a node restart loses its replay buffers).
 */
export class InMemoryEventStore implements EventStore {
  private readonly bufferPerStream: number;
  private readonly streams = new Map<StreamId, StoredEvent[]>();
  private readonly index = new Map<EventId, StreamId>();
  private seq = 0;

  constructor(opts: InMemoryEventStoreOptions) {
    if (!Number.isInteger(opts.bufferPerStream) || opts.bufferPerStream < 1) {
      throw new Error('bufferPerStream must be a positive integer');
    }
    this.bufferPerStream = opts.bufferPerStream;
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `${streamId}:${++this.seq}`;
    let events = this.streams.get(streamId);
    if (!events) {
      events = [];
      this.streams.set(streamId, events);
    }
    events.push({ eventId, message });
    this.index.set(eventId, streamId);

    while (events.length > this.bufferPerStream) {
      const dropped = events.shift();
      if (dropped) this.index.delete(dropped.eventId);
    }
    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.index.get(eventId);
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> },
  ): Promise<StreamId> {
    const knownStream = this.index.get(lastEventId);
    const streamId = knownStream ?? this.streamIdFromEventId(lastEventId);
    const events = this.streams.get(streamId) ?? [];

    const startIdx = knownStream
      ? events.findIndex((e) => e.eventId === lastEventId) + 1
      : 0;

    for (let i = startIdx; i < events.length; i++) {
      const e = events[i]!;
      await send(e.eventId, e.message);
    }
    return streamId;
  }

  private streamIdFromEventId(eventId: EventId): StreamId {
    const colon = eventId.lastIndexOf(':');
    return colon > 0 ? eventId.slice(0, colon) : eventId;
  }
}
