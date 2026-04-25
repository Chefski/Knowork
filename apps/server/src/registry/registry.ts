import type { Repository } from '../db/repository.js';
import { RoomState } from './room-state.js';

export interface RegistryOptions {
  repository: Repository;
  /** Wall-clock window for the legacy stateless heartbeat path. */
  expiryMs?: number;
  /** Hard cap on any active entry's age, regardless of session connectivity. */
  sessionMaxAgeMs?: number;
  /** Window after MCP session close during which a same-id reconnect resumes entries. */
  disconnectGraceMs?: number;
  sweepIntervalMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => NodeJS.Timeout;
  clearTimer?: (handle: NodeJS.Timeout) => void;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, RoomState>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private sweepHandle: NodeJS.Timeout | null = null;
  private readonly expiryMs: number;
  private readonly sessionMaxAgeMs: number;
  private readonly disconnectGraceMs: number;
  private readonly sweepIntervalMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => NodeJS.Timeout;
  private readonly clearTimer: (handle: NodeJS.Timeout) => void;

  constructor(private readonly opts: RegistryOptions) {
    this.expiryMs = opts.expiryMs ?? 90_000;
    this.sessionMaxAgeMs = opts.sessionMaxAgeMs ?? 24 * 60 * 60 * 1000;
    this.disconnectGraceMs = opts.disconnectGraceMs ?? 30_000;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 15_000;
    this.setTimer =
      opts.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        t.unref?.();
        return t;
      });
    this.clearTimer = opts.clearTimer ?? clearTimeout;
  }

  getOrCreate(code: string): RoomState {
    let room = this.rooms.get(code);
    if (!room) {
      room = new RoomState(code, this.opts.repository, this.opts.now);
      this.rooms.set(code, room);
    }
    return room;
  }

  get(code: string): RoomState | undefined {
    return this.rooms.get(code);
  }

  forEach(fn: (room: RoomState) => void): void {
    for (const room of this.rooms.values()) fn(room);
  }

  /**
   * Mark every active entry owned by `sessionId` (across all rooms) as
   * disconnected, broadcast `work_session_disconnected`, and arm a single
   * grace timer. If the timer fires without a `resumeSession` call, the
   * entries are finalized as `session_closed`.
   */
  markSessionDisconnected(sessionId: string): void {
    const t = this.now();
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.markEntriesDisconnected(sessionId, t);
    }
    if (total === 0) return;

    const prev = this.graceTimers.get(sessionId);
    if (prev) this.clearTimer(prev);
    const timer = this.setTimer(() => this.expireSession(sessionId), this.disconnectGraceMs);
    this.graceTimers.set(sessionId, timer);
  }

  /** True when `sessionId` has an in-flight grace timer (i.e. its entries are
   *  currently flagged disconnected). Cheap check used to gate the
   *  `onSessionResumed` hook so it fires only on real reconnects. */
  isSessionDisconnected(sessionId: string): boolean {
    return this.graceTimers.has(sessionId);
  }

  /**
   * Cancel the pending grace timer for `sessionId`, clear the disconnected
   * flag on every owned entry, and broadcast `work_session_resumed`.
   */
  resumeSession(sessionId: string): void {
    const timer = this.graceTimers.get(sessionId);
    if (timer) this.clearTimer(timer);
    this.graceTimers.delete(sessionId);
    const t = this.now();
    for (const room of this.rooms.values()) {
      room.resumeEntries(sessionId, t);
    }
  }

  private expireSession(sessionId: string): void {
    this.graceTimers.delete(sessionId);
    for (const room of this.rooms.values()) {
      room.finalizeDisconnectedSession(sessionId);
    }
  }

  startSweep(): void {
    if (this.sweepHandle) return;
    this.sweepHandle = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.sweepHandle.unref?.();
  }

  stopSweep(): void {
    if (this.sweepHandle) {
      clearInterval(this.sweepHandle);
      this.sweepHandle = null;
    }
    for (const timer of this.graceTimers.values()) this.clearTimer(timer);
    this.graceTimers.clear();
  }

  sweep(): number {
    let expired = 0;
    for (const room of this.rooms.values()) {
      // Max-age backstop applies regardless of session connectivity.
      expired += room.expireMaxAge(this.sessionMaxAgeMs).length;
      // Legacy stateless entries (no owning session) still expire on heartbeat-missed.
      expired += room.expireStale(this.expiryMs).length;
    }
    return expired;
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }
}
