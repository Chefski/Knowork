import { useEffect, useState } from 'react';
import type { ActiveEntry, CompletedEntry } from '@apb/shared';
import { EntryCard } from './EntryCard.js';
import { CompletedCard } from './CompletedCard.js';

const IDLE_THRESHOLD_MS = 60_000;
const EXPIRY_THRESHOLD_MS = 90_000;

export function BoardView({ active, recent }: { active: ActiveEntry[]; recent: CompletedEntry[] }) {
  const now = useNow(5_000);
  // Disconnected entries (session in grace) render with their own ghosted treatment.
  // They are NOT bucketed into idle/expired which are wall-clock heuristics for the
  // legacy stateless heartbeat path.
  const disconnected = active.filter((e) => e.disconnected_at);
  const liveOrIdle = active.filter((e) => !e.disconnected_at);
  const live = liveOrIdle.filter((e) => now - e.last_seen < IDLE_THRESHOLD_MS);
  const idle = liveOrIdle.filter((e) => {
    const age = now - e.last_seen;
    return age >= IDLE_THRESHOLD_MS && age < EXPIRY_THRESHOLD_MS;
  });

  return (
    <div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3">
      <Column title="Active" count={live.length + disconnected.length}>
        {live.map((entry) => (
          <EntryCard key={entry.work_id} entry={entry} />
        ))}
        {disconnected.map((entry) => (
          <EntryCard key={entry.work_id} entry={entry} />
        ))}
        {!live.length && !disconnected.length && <Empty>No active work right now.</Empty>}
      </Column>
      <Column title="Idle" count={idle.length}>
        {idle.map((entry) => (
          <EntryCard key={entry.work_id} entry={entry} idle />
        ))}
        {!idle.length && <Empty>Nothing idle.</Empty>}
      </Column>
      <Column title="Recently Shipped" count={recent.length}>
        {recent.slice(0, 100).map((entry) => (
          <CompletedCard key={`${entry.id}-${entry.completed_at}`} entry={entry} />
        ))}
        {!recent.length && <Empty>Nothing shipped yet.</Empty>}
      </Column>
    </div>
  );
}

function Column({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-200">
      <header className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{count}</span>
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-4 text-xs text-ink-400">{children}</p>;
}

function useNow(intervalMs: number): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t;
}
