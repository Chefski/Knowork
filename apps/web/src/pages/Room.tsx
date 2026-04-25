import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'wouter';
import type { ServerEvent } from '@apb/shared';
import { useRoomStore } from '../store.js';
import { getActive, getHistory } from '../api.js';
import { RoomSocket } from '../socket.js';
import { Header } from '../components/Header.js';
import { BoardView } from '../components/BoardView.js';
import { TableView } from '../components/TableView.js';

const LAST_ROOM_KEY = 'apb:last-room-code';

export function Room() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const store = useRoomStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.enterRoom(code);
    localStorage.setItem(LAST_ROOM_KEY, code);

    (async () => {
      try {
        const [active, recent] = await Promise.all([getActive(code), getHistory(code)]);
        if (cancelled) return;
        store.setSnapshot(active, recent);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'failed');
      }
    })();

    const socket = new RoomSocket(code, {
      onOpen: () => store.setConnection('open'),
      onClose: () => store.setConnection('closed'),
      onEvent: (event: ServerEvent) => {
        switch (event.type) {
          case 'snapshot':
            store.setSnapshot(event.data.active, event.data.recently_shipped);
            break;
          case 'work_started':
            store.startEntry(event.entry);
            break;
          case 'work_completed':
            store.completeEntry(event.entry);
            break;
          case 'work_expired':
            store.expireEntry(event.entry);
            break;
          case 'pong':
            break;
        }
      },
    });
    socket.connect();

    return () => {
      cancelled = true;
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const filteredActive = useMemo(() => filterActive(store.active, store.search), [store.active, store.search]);
  const filteredRecent = useMemo(() => filterRecent(store.recent, store.search), [store.recent, store.search]);

  return (
    <div className="flex min-h-full flex-col">
      <Header code={code} />
      <main className="flex-1 px-6 pb-12">
        {error && <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {store.view === 'board' ? (
          <BoardView active={filteredActive} recent={filteredRecent} />
        ) : (
          <TableView active={filteredActive} recent={filteredRecent} />
        )}
      </main>
    </div>
  );
}

function filterActive(items: ReturnType<typeof useRoomStore.getState>['active'], q: string) {
  if (!q.trim()) return items;
  const needle = q.toLowerCase();
  return items.filter((e) => matchEntry(e, needle));
}

function filterRecent(items: ReturnType<typeof useRoomStore.getState>['recent'], q: string) {
  if (!q.trim()) return items;
  const needle = q.toLowerCase();
  return items.filter((e) => matchEntry(e, needle));
}

interface FilterableEntry {
  agent_identity: { name: string; tool: string };
  tool: string;
  repo: string;
  branch: string | null;
  intent: string;
}

function matchEntry(e: FilterableEntry, needle: string): boolean {
  return (
    e.agent_identity.name.toLowerCase().includes(needle) ||
    e.tool.toLowerCase().includes(needle) ||
    e.agent_identity.tool.toLowerCase().includes(needle) ||
    e.repo.toLowerCase().includes(needle) ||
    (e.branch?.toLowerCase().includes(needle) ?? false) ||
    e.intent.toLowerCase().includes(needle)
  );
}
