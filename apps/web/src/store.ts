import { create } from 'zustand';
import type { ActiveEntry, CompletedEntry } from '@apb/shared';

export type ViewMode = 'board' | 'table';
export type ConnectionState = 'connecting' | 'open' | 'closed';

interface RoomStore {
  roomCode: string | null;
  active: ActiveEntry[];
  recent: CompletedEntry[];
  view: ViewMode;
  search: string;
  connection: ConnectionState;

  enterRoom(code: string): void;
  setSnapshot(active: ActiveEntry[], recent: CompletedEntry[]): void;
  startEntry(entry: ActiveEntry): void;
  heartbeatEntry(workId: string, lastSeen: number): void;
  disconnectEntry(workId: string, disconnectedAt: number): void;
  resumeEntry(workId: string): void;
  completeEntry(workId: string, completed: CompletedEntry): void;
  expireEntry(workId: string, completed: CompletedEntry): void;
  setView(view: ViewMode): void;
  setSearch(query: string): void;
  setConnection(state: ConnectionState): void;
}

const HISTORY_CAP = 100;

export const useRoomStore = create<RoomStore>((set) => ({
  roomCode: null,
  active: [],
  recent: [],
  view: 'board',
  search: '',
  connection: 'connecting',

  enterRoom(code) {
    set({ roomCode: code, active: [], recent: [], connection: 'connecting' });
  },

  setSnapshot(active, recent) {
    set({ active, recent });
  },

  startEntry(entry) {
    set((s) => ({
      active: [entry, ...s.active.filter((e) => e.work_id !== entry.work_id)],
    }));
  },

  heartbeatEntry(workId, lastSeen) {
    set((s) => ({
      active: s.active.map((e) => (e.work_id === workId ? { ...e, last_seen: lastSeen } : e)),
    }));
  },

  disconnectEntry(workId, disconnectedAt) {
    set((s) => ({
      active: s.active.map((e) =>
        e.work_id === workId ? { ...e, disconnected_at: disconnectedAt } : e,
      ),
    }));
  },

  resumeEntry(workId) {
    set((s) => ({
      active: s.active.map((e) =>
        e.work_id === workId ? { ...e, disconnected_at: null } : e,
      ),
    }));
  },

  completeEntry(workId, completed) {
    set((s) => ({
      active: s.active.filter((e) => e.work_id !== workId),
      recent: [completed, ...s.recent.filter((e) => e.work_id !== workId)].slice(0, HISTORY_CAP),
    }));
  },

  expireEntry(workId, completed) {
    set((s) => ({
      active: s.active.filter((e) => e.work_id !== workId),
      recent: [completed, ...s.recent.filter((e) => e.work_id !== workId)].slice(0, HISTORY_CAP),
    }));
  },

  setView(view) {
    set({ view });
  },
  setSearch(query) {
    set({ search: query });
  },
  setConnection(state) {
    set({ connection: state });
  },
}));
