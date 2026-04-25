import type { CompletedEntry } from '@apb/shared';
import { relativeTime } from '../util/time.js';

export function CompletedCard({ entry }: { entry: CompletedEntry }) {
  const { label, kind } = describeCompletion(entry.completion_reason);
  return (
    <article className="rounded-lg border border-ink-200 bg-white p-3 text-sm">
      <header className="flex items-center justify-between gap-2">
        <strong className="truncate font-medium">{entry.agent_identity.name}</strong>
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            kind === 'shipped'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}
        >
          {label}
        </span>
      </header>
      <p className="mt-1.5 text-ink-800">{entry.intent}</p>
      {entry.summary && <p className="mt-1 text-xs text-ink-600">— {entry.summary}</p>}
      <div className="mt-2 font-mono text-xs text-ink-400">
        {entry.repo}
        {entry.branch && ` @ ${entry.branch}`} · {relativeTime(entry.completed_at)}
      </div>
    </article>
  );
}

function describeCompletion(
  reason: CompletedEntry['completion_reason'],
): { label: string; kind: 'shipped' | 'expired' } {
  switch (reason) {
    case 'completed':
      return { label: 'shipped', kind: 'shipped' };
    case 'expired_then_completed':
      return { label: 'shipped (late)', kind: 'shipped' };
    case 'session_closed':
      return { label: 'session closed', kind: 'expired' };
    case 'session_max_age':
      return { label: 'max age', kind: 'expired' };
    case 'expired':
    default:
      return { label: 'expired', kind: 'expired' };
  }
}
