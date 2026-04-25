import { useMemo, useState } from 'react';
import type { ActiveEntry, CompletedEntry } from '@apb/shared';
import { relativeTime } from '../util/time.js';

type SortKey = 'who' | 'tool' | 'repo' | 'branch' | 'intent' | 'started' | 'last_seen';
type Direction = 'asc' | 'desc';

export function TableView({
  active,
  recent,
}: {
  active: ActiveEntry[];
  recent: CompletedEntry[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>('started');
  const [dir, setDir] = useState<Direction>('desc');

  const sorted = useMemo(() => sortEntries(active, sortKey, dir), [active, sortKey, dir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(k);
      setDir('asc');
    }
  }

  return (
    <div className="space-y-8 pt-4">
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight">Active ({active.length})</h2>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left text-xs uppercase tracking-wider text-ink-600">
              <tr>
                <Th label="Who" k="who" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Tool" k="tool" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Repo" k="repo" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Branch" k="branch" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Intent" k="intent" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Started" k="started" sortKey={sortKey} dir={dir} onClick={toggle} />
                <Th label="Last Seen" k="last_seen" sortKey={sortKey} dir={dir} onClick={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.work_id} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-medium">{e.agent_identity.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.tool}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.repo}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.branch ?? ''}</td>
                  <td className="px-3 py-2">{e.intent}</td>
                  <td className="px-3 py-2 text-xs text-ink-600">{relativeTime(e.started_at)}</td>
                  <td className="px-3 py-2 text-xs text-ink-600">{relativeTime(e.last_seen)}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-ink-400">
                    No active work.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-tight">
          Recently Shipped ({recent.length})
        </h2>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-200">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left text-xs uppercase tracking-wider text-ink-600">
              <tr>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Repo</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={`${e.id}-${e.completed_at}`} className="border-t border-ink-100">
                  <td className="px-3 py-2 font-medium">{e.agent_identity.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.tool}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.repo}</td>
                  <td className="px-3 py-2">
                    {e.intent}
                    {e.summary && <span className="text-ink-400"> — {e.summary}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{e.completion_reason}</td>
                  <td className="px-3 py-2 text-xs text-ink-600">{relativeTime(e.completed_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-ink-400">
                    Nothing shipped yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: Direction;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onClick(k)}
        className={'flex items-center gap-1 ' + (active ? 'text-ink-900' : 'text-ink-600')}
      >
        {label}
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

function sortEntries(items: ActiveEntry[], k: SortKey, dir: Direction): ActiveEntry[] {
  const copy = items.slice();
  copy.sort((a, b) => {
    const va = key(a, k);
    const vb = key(b, k);
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  return copy;
}

function key(e: ActiveEntry, k: SortKey): string | number {
  switch (k) {
    case 'who':
      return e.agent_identity.name.toLowerCase();
    case 'tool':
      return e.tool.toLowerCase();
    case 'repo':
      return e.repo.toLowerCase();
    case 'branch':
      return (e.branch ?? '').toLowerCase();
    case 'intent':
      return e.intent.toLowerCase();
    case 'started':
      return e.started_at;
    case 'last_seen':
      return e.last_seen;
  }
}
