import type { ActiveEntry } from '@apb/shared';
import { relativeTime } from '../util/time.js';

export function EntryCard({ entry, idle = false }: { entry: ActiveEntry; idle?: boolean }) {
  const disconnected = !!entry.disconnected_at;
  let stateClass = 'border-ink-200 hover:border-ink-400';
  if (disconnected) stateClass = 'border-ink-200 opacity-60 saturate-50';
  else if (idle) stateClass = 'border-amber-200';
  return (
    <article
      className={`rounded-lg border bg-white p-3 text-sm transition ${stateClass}`}
      data-testid="entry-card"
      data-disconnected={disconnected || undefined}
    >
      <header className="flex items-center justify-between gap-2">
        <strong className="truncate font-medium">{entry.agent_identity.name}</strong>
        <ToolBadge tool={entry.tool} />
      </header>
      <p className="mt-1.5 text-ink-800">{entry.intent}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-600">
        <span className="truncate">{entry.repo}</span>
        {entry.branch && <span className="text-ink-400">@ {entry.branch}</span>}
        <span className="text-ink-400">started {relativeTime(entry.started_at)}</span>
        {disconnected && (
          <span className="text-ink-500" data-testid="reconnecting-indicator">
            reconnecting…
          </span>
        )}
        {!disconnected && idle && <span className="text-amber-600">idle</span>}
      </div>
      {entry.files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1 font-mono text-xs text-ink-400">
          {entry.files.slice(0, 5).map((f) => (
            <li key={f} className="rounded bg-ink-100 px-1.5 py-0.5">
              {f}
            </li>
          ))}
          {entry.files.length > 5 && <li>+{entry.files.length - 5} more</li>}
        </ul>
      )}
    </article>
  );
}

function ToolBadge({ tool }: { tool: string }) {
  return (
    <span className="rounded bg-ink-900 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-white">
      {tool}
    </span>
  );
}
