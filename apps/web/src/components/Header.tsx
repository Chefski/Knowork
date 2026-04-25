import { useState } from 'react';
import { useRoomStore, type ViewMode } from '../store.js';

export function Header({ code }: { code: string }) {
  const view = useRoomStore((s) => s.view);
  const setView = useRoomStore((s) => s.setView);
  const search = useRoomStore((s) => s.search);
  const setSearch = useRoomStore((s) => s.setSearch);
  const conn = useRoomStore((s) => s.connection);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function shareLink() {
    const url = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-ink-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-ink-400">room</span>
        <button
          type="button"
          onClick={copyCode}
          title="Copy room code"
          className="font-mono text-2xl font-semibold tracking-[0.25em] hover:text-ink-600"
        >
          {code}
        </button>
        <button
          type="button"
          onClick={shareLink}
          className="rounded border border-ink-200 px-2 py-1 text-xs hover:bg-ink-100"
        >
          Share link
        </button>
        {copied && <span className="text-xs text-ink-400">copied</span>}
        <ConnectionBadge state={conn} />
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="filter by agent / repo / intent…"
          className="w-72 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-ink-400 focus:outline-none"
        />
        <ViewToggle current={view} onChange={setView} />
      </div>
    </header>
  );
}

function ViewToggle({ current, onChange }: { current: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-ink-200">
      <ToggleButton active={current === 'board'} onClick={() => onChange('board')}>
        Board
      </ToggleButton>
      <ToggleButton active={current === 'table'} onClick={() => onChange('table')}>
        Table
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-1.5 text-sm transition ' +
        (active ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 hover:bg-ink-100')
      }
    >
      {children}
    </button>
  );
}

function ConnectionBadge({ state }: { state: 'connecting' | 'open' | 'closed' }) {
  const cls =
    state === 'open'
      ? 'bg-emerald-100 text-emerald-700'
      : state === 'connecting'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700';
  const text = state === 'open' ? 'live' : state === 'connecting' ? 'connecting' : 'reconnecting';
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{text}</span>;
}
