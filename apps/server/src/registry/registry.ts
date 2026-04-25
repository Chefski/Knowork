import type { Repository } from '../db/repository.js';
import { RoomState } from './room-state.js';

export interface RegistryOptions {
  repository: Repository;
  expiryMs?: number;
  sweepIntervalMs?: number;
  now?: () => number;
}

export class RoomRegistry {
  private readonly rooms = new Map<string, RoomState>();
  private sweepHandle: NodeJS.Timeout | null = null;
  private readonly expiryMs: number;
  private readonly sweepIntervalMs: number;

  constructor(private readonly opts: RegistryOptions) {
    this.expiryMs = opts.expiryMs ?? 90_000;
    this.sweepIntervalMs = opts.sweepIntervalMs ?? 15_000;
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
  }

  sweep(): number {
    let expired = 0;
    for (const room of this.rooms.values()) {
      expired += room.expireStale(this.expiryMs).length;
    }
    return expired;
  }
}
