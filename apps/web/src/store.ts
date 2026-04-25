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
  completeEntry(completed: CompletedEntry): void;
  expireEntry(completed: CompletedEntry): void;
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

  completeEntry(completed) {
    set((s) => ({
      active: s.active.filter((e) => e.work_id !== findWorkId(s.active, completed)),
      recent: [completed, ...s.recent].slice(0, HISTORY_CAP),
    }));
  },

  expireEntry(completed) {
    set((s) => ({
      active: s.active.filter((e) => e.work_id !== findWorkId(s.active, completed)),
      recent: [completed, ...s.recent].slice(0, HISTORY_CAP),
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

function findWorkId(active: ActiveEntry[], completed: CompletedEntry): string | undefined {
  const match = active.find(
    (a) =>
      a.repo === completed.repo &&
      a.intent === completed.intent &&
      a.started_at === completed.started_at &&
      a.agent_identity.name === completed.agent_identity.name,
  );
  return match?.work_id;
}
