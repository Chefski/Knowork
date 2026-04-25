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
  /** Hard cap on distinct streams retained. The least-recently-written stream
   *  is evicted in full when this is exceeded. The SDK mints a fresh streamId
   *  (`crypto.randomUUID()`) for every POST that returns SSE — without this
   *  cap, `streams`/`index` grow with cumulative POST count rather than active
   *  sessions on a long-running process. */
  maxStreams: number;
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
  private readonly maxStreams: number;
  private readonly streams = new Map<StreamId, StoredEvent[]>();
  private readonly index = new Map<EventId, StreamId>();
  private seq = 0;

  constructor(opts: InMemoryEventStoreOptions) {
    if (!Number.isInteger(opts.bufferPerStream) || opts.bufferPerStream < 1) {
      throw new Error('bufferPerStream must be a positive integer');
    }
    if (!Number.isInteger(opts.maxStreams) || opts.maxStreams < 1) {
      throw new Error('maxStreams must be a positive integer');
    }
    this.bufferPerStream = opts.bufferPerStream;
    this.maxStreams = opts.maxStreams;
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `${streamId}:${++this.seq}`;
    let events = this.streams.get(streamId);
    if (!events) {
      // New stream: evict the least-recently-written stream first if at cap.
      // Map iteration is insertion-order, so the first key is the oldest.
      while (this.streams.size >= this.maxStreams) {
        const oldest = this.streams.keys().next().value;
        if (oldest === undefined) break;
        this.dropStream(oldest);
      }
      events = [];
      this.streams.set(streamId, events);
    } else {
      // Refresh LRU position so the most-recently-written stream is "newest".
      this.streams.delete(streamId);
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
    // Indexed hit: the event is still buffered, return its stream directly.
    const known = this.index.get(eventId);
    if (known !== undefined) return known;
    // Graceful degradation for evicted IDs: if the parsed stream prefix still
    // exists, return it so the SDK proceeds to `replayEventsAfter` (which
    // replays whatever is left in the buffer). The SDK rejects an undefined
    // result with 400 'Invalid event ID format' before ever calling replay.
    const candidate = this.streamIdFromEventId(eventId);
    return this.streams.has(candidate) ? candidate : undefined;
  }

  private dropStream(streamId: StreamId): void {
    const events = this.streams.get(streamId);
    if (!events) return;
    for (const e of events) this.index.delete(e.eventId);
    this.streams.delete(streamId);
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
