import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ResolvedScope, ScopeFlag } from './types.js';

// Scope resolution lives in its own module so adapters and the connect/disconnect
// commands can depend on it without circularity.

export function isInsideGitRepo(cwd: string = process.cwd()): boolean {
  // Walking up looking for `.git` is faster than spawning `git` and works in
  // the common case. Spawn `git rev-parse` only as a fallback so we still
  // detect worktrees / submodules whose `.git` is a regular file pointer.
  let dir = resolve(cwd);
  while (true) {
    const gitPath = resolve(dir, '.git');
    if (existsSync(gitPath)) {
      try {
        const stat = statSync(gitPath);
        if (stat.isDirectory() || stat.isFile()) return true;
      } catch {}
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

export function gitRepoRoot(cwd: string = process.cwd()): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

export function resolveScope(
  flag: ScopeFlag,
  adapterSupportsProject: boolean,
  cwd: string = process.cwd(),
): ResolvedScope {
  if (flag === 'global') return 'global';
  if (flag === 'project') {
    if (!adapterSupportsProject) {
      // Caller must catch and remediate. Throwing here keeps every adapter
      // honest — none of them silently fall back from --project to global.
      throw new Error(
        'The selected adapter does not support project-scope; pass --global or omit the flag.',
      );
    }
    return 'project';
  }
  if (adapterSupportsProject && isInsideGitRepo(cwd)) return 'project';
  return 'global';
}
