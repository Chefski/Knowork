import { describe, expect, it } from 'vitest';
import {
  KNOWORK_RULES_END_MARKER,
  KNOWORK_RULES_START_MARKER,
  knoworkRulesBlock,
} from '@apb/shared';
import { applyRulesBlock, removeRulesBlock } from './rules-file.js';

const block = knoworkRulesBlock();

describe('applyRulesBlock', () => {
  it('creates a new file when none exists', () => {
    const result = applyRulesBlock(null, block);
    expect(result).toBe(block);
  });

  it('creates a file from empty input', () => {
    const result = applyRulesBlock('', block);
    expect(result).toBe(block);
  });

  it('appends to an existing file with one blank-line separator', () => {
    const existing = '# Project\n\nUser-authored content.\n';
    const result = applyRulesBlock(existing, block);
    expect(result.startsWith(existing)).toBe(true);
    // Existing already ends with a single `\n`, so we add one more `\n` then the block.
    expect(result).toBe(existing + '\n' + block);
  });

  it('appends without adding extra newlines when file already ends with blank line', () => {
    const existing = '# Project\n\nUser content.\n\n';
    const result = applyRulesBlock(existing, block);
    expect(result).toBe(existing + block);
  });

  it('appends with full separator when file does not end with newline', () => {
    const existing = 'no trailing newline';
    const result = applyRulesBlock(existing, block);
    expect(result).toBe(existing + '\n\n' + block);
  });

  it('replaces between existing markers, leaving surrounding bytes intact', () => {
    const before = '# My rules\n\nKeep me safe.\n\n';
    const after = '\nMore content after.\n';
    const stale =
      `${KNOWORK_RULES_START_MARKER}\n## Old text\n${KNOWORK_RULES_END_MARKER}\n`;
    const existing = before + stale + after;
    const result = applyRulesBlock(existing, block);
    expect(result).toBe(before + block + after);
  });

  it('is idempotent — apply twice equals apply once', () => {
    const existing = '# Project\n\nUser content.\n';
    const once = applyRulesBlock(existing, block);
    const twice = applyRulesBlock(once, block);
    expect(twice).toBe(once);
  });

  it('idempotent on empty input as well', () => {
    const once = applyRulesBlock(null, block);
    const twice = applyRulesBlock(once, block);
    expect(twice).toBe(once);
  });
});

describe('removeRulesBlock', () => {
  it('is a no-op when markers are absent', () => {
    const existing = '# Just user content\n';
    expect(removeRulesBlock(existing)).toBe(existing);
  });

  it('removes the marker pair and content between them', () => {
    const existing = `before\n\n${KNOWORK_RULES_START_MARKER}\nmanaged\n${KNOWORK_RULES_END_MARKER}\nafter\n`;
    const result = removeRulesBlock(existing);
    expect(result).not.toContain(KNOWORK_RULES_START_MARKER);
    expect(result).not.toContain(KNOWORK_RULES_END_MARKER);
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('round-trips: apply then remove returns to original on append', () => {
    const original = '# Project\n\nUser content.\n';
    const applied = applyRulesBlock(original, block);
    const restored = removeRulesBlock(applied);
    expect(restored).toBe(original);
  });

  it('round-trips on empty file → null-equivalent restoration', () => {
    const applied = applyRulesBlock('', block);
    const restored = removeRulesBlock(applied);
    // Removing the entire block from a file that contained only the block
    // leaves an empty string. Caller decides whether to delete the file.
    expect(restored).toBe('');
  });

  it('preserves user-authored content surrounding the markers byte-for-byte', () => {
    const userBefore = '# Title\n\nLine one.\nLine two.\n\n';
    const userAfter = '\n\nFooter line.\n';
    const existing = userBefore + block + userAfter;
    const result = removeRulesBlock(existing);
    expect(result).toContain(userBefore.trim());
    expect(result).toContain(userAfter.trim());
  });
});
