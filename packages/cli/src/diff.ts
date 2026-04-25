// A minimal, unified-diff-ish renderer used for `--dry-run` and the final summary.
// Pulling in `diff` from npm would be overkill for the line-level granularity
// the CLI actually shows the user.

import type { PlannedWrite } from './types.js';

export function renderPlannedWrites(plans: PlannedWrite[]): string {
  if (plans.length === 0) return '(no changes)\n';
  return plans.map(renderOne).join('\n');
}

function renderOne(plan: PlannedWrite): string {
  const header = `--- ${plan.path}`;
  const { before, after, reason } = plan;
  if (before === null && after !== null) {
    return `${header}\n+++ (new file) — ${reason}\n${indent(after, '+ ')}\n`;
  }
  if (before !== null && after === null) {
    return `${header}\n+++ (deleted) — ${reason}\n${indent(before, '- ')}\n`;
  }
  if (before === after) {
    return `${header}\n(no change) — ${reason}\n`;
  }
  return `${header}\n+++ ${plan.path} — ${reason}\n${naiveDiff(before ?? '', after ?? '')}\n`;
}

function indent(s: string, prefix: string): string {
  return s
    .split('\n')
    .map((line, i, arr) => (i === arr.length - 1 && line === '' ? '' : prefix + line))
    .join('\n');
}

// Line-by-line diff. We accept that this misses moved-line nuance — the user
// is free to read the file. For onboarding writes that's enough signal.
function naiveDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) {
      if (av !== undefined) out.push('  ' + av);
    } else {
      if (av !== undefined) out.push('- ' + av);
      if (bv !== undefined) out.push('+ ' + bv);
    }
  }
  return out.join('\n');
}
