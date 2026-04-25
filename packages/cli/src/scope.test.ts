import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isInsideGitRepo, resolveScope } from './scope.js';

describe('resolveScope', () => {
  it('--global wins regardless of context', () => {
    expect(resolveScope('global', true)).toBe('global');
    expect(resolveScope('global', false)).toBe('global');
  });

  it('--project requires adapter support', () => {
    expect(resolveScope('project', true)).toBe('project');
    expect(() => resolveScope('project', false)).toThrow(/does not support project-scope/);
  });

  it('auto picks project inside a git repo when adapter supports it', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-scope-'));
    try {
      mkdirSync(join(tmp, '.git'));
      expect(resolveScope('auto', true, tmp)).toBe('project');
      expect(resolveScope('auto', false, tmp)).toBe('global');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('auto picks global outside a git repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-scope-'));
    try {
      // No .git directory.
      expect(resolveScope('auto', true, tmp)).toBe('global');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('isInsideGitRepo', () => {
  it('returns false in a freshly-created tmp dir', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-nogit-'));
    try {
      expect(isInsideGitRepo(tmp)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns true when a .git directory exists in an ancestor', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-git-'));
    try {
      mkdirSync(join(tmp, '.git'));
      mkdirSync(join(tmp, 'nested', 'deeper'), { recursive: true });
      expect(isInsideGitRepo(join(tmp, 'nested', 'deeper'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
