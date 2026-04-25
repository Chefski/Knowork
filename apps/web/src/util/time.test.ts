import { describe, expect, it } from 'vitest';
import { relativeTime } from './time.js';

describe('relativeTime', () => {
  const NOW = 1_700_000_000_000;

  it('formats very recent timestamps as just now', () => {
    expect(relativeTime(NOW - 1_000, NOW)).toBe('just now');
    expect(relativeTime(NOW - 4_000, NOW)).toBe('just now');
  });

  it('formats seconds, minutes, hours, and days buckets', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('10s ago');
    expect(relativeTime(NOW - 2 * 60_000, NOW)).toBe('2m ago');
    expect(relativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
    expect(relativeTime(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe('2d ago');
  });

  it('clamps future timestamps to just now', () => {
    expect(relativeTime(NOW + 30_000, NOW)).toBe('just now');
  });
});
