import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlannedWrite } from './types.js';

// Buffered file mutator used by connect/disconnect. We compute every planned
// write up front (so `--dry-run` can render diffs and `connect` can validate
// safety constraints atomically), then either apply the batch or print it.

export function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

export function applyPlannedWrites(plans: PlannedWrite[]): void {
  for (const plan of plans) {
    if (plan.before === plan.after) continue;
    if (plan.after === null) {
      // The adapters can return "" to signal "this file no longer has any
      // managed content — delete it" but they cannot return null. We only
      // delete when explicitly requested via after === null.
      if (existsSync(plan.path)) unlinkSync(plan.path);
      continue;
    }
    mkdirSync(dirname(plan.path), { recursive: true });
    writeFileSync(plan.path, plan.after, 'utf8');
  }
}

// True when the directory containing `path` is inside a git repo. Used to
// gate the "refuse to write a token into a tracked file" check; we only need
// the repo-root resolution to decide whether the path is "git-tracked-ish".
export function isPathInsideGitTree(path: string): boolean {
  let dir = dirname(path);
  // Walk up; the existence of any `.git` ancestor is enough to count this as
  // inside a tree. We deliberately don't shell out to `git ls-files` — the
  // file may not exist yet on disk.
  while (true) {
    if (existsSync(`${dir}/.git`)) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
