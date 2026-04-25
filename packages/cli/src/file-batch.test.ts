import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPlannedWrites, isPathInsideGitTree, readIfExists } from './file-batch.js';

describe('applyPlannedWrites', () => {
  it('creates a new file when before=null', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-batch-'));
    try {
      const path = join(tmp, 'nested', 'a.json');
      applyPlannedWrites([{ path, before: null, after: '{"x":1}\n', reason: 'create' }]);
      expect(readFileSync(path, 'utf8')).toBe('{"x":1}\n');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('overwrites an existing file when after differs', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-batch-'));
    try {
      const path = join(tmp, 'a.json');
      writeFileSync(path, 'old');
      applyPlannedWrites([{ path, before: 'old', after: 'new', reason: 'update' }]);
      expect(readFileSync(path, 'utf8')).toBe('new');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('skips no-op plans (before === after)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-batch-'));
    try {
      const path = join(tmp, 'a.json');
      writeFileSync(path, 'same');
      applyPlannedWrites([{ path, before: 'same', after: 'same', reason: 'noop' }]);
      expect(readFileSync(path, 'utf8')).toBe('same');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('deletes a file when after=null', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-batch-'));
    try {
      const path = join(tmp, 'a.json');
      writeFileSync(path, 'gone soon');
      applyPlannedWrites([{ path, before: 'gone soon', after: null, reason: 'delete' }]);
      expect(existsSync(path)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('readIfExists', () => {
  it('returns null when the path does not exist', () => {
    expect(readIfExists('/definitely/does/not/exist/knowork-test')).toBeNull();
  });
});

describe('isPathInsideGitTree', () => {
  it('detects an ancestor `.git` directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-git-'));
    try {
      mkdirSync(join(tmp, '.git'));
      mkdirSync(join(tmp, 'sub'));
      expect(isPathInsideGitTree(join(tmp, 'sub', 'file.json'))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns false outside a git tree', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-nogit-'));
    try {
      expect(isPathInsideGitTree(join(tmp, 'file.json'))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
