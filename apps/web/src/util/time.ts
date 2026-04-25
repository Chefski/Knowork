export function relativeTime(t: number, now: number = Date.now()): string {
  const dSec = Math.max(0, Math.round((now - t) / 1000));
  if (dSec < 5) return 'just now';
  if (dSec < 60) return `${dSec}s ago`;
  const dMin = Math.round(dSec / 60);
  if (dMin < 60) return `${dMin}m ago`;
  const dH = Math.round(dMin / 60);
  if (dH < 24) return `${dH}h ago`;
  const dD = Math.round(dH / 24);
  return `${dD}d ago`;
}
