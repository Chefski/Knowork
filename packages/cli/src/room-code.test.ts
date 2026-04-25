import { describe, expect, it } from 'vitest';
import { normalizeRoomCode } from './room-code.js';
import { CliError } from './errors.js';

describe('normalizeRoomCode', () => {
  it('uppercases, trims, and accepts canonical codes', () => {
    // The Knowork alphabet excludes 0/1/I/L/O, so the lowercase fixture sticks
    // to letters that round-trip through toUpperCase() into valid characters.
    expect(normalizeRoomCode('  abcdfghjkm  ')).toBe('ABCDFGHJKM');
    expect(normalizeRoomCode('ABCDEFGHJK')).toBe('ABCDEFGHJK');
  });

  it('rejects wrong-length codes with remediation', () => {
    expect(() => normalizeRoomCode('ABC')).toThrow(CliError);
    expect(() => normalizeRoomCode('ABCDEFGHIJK')).toThrow(/expected 10/);
  });

  it('rejects characters outside the Knowork alphabet', () => {
    expect(() => normalizeRoomCode('ABCDEFGHI0')).toThrow(/alphabet/);
    expect(() => normalizeRoomCode('ABCDEFGHIO')).toThrow(/alphabet/);
    expect(() => normalizeRoomCode('ABCDEFGHIL')).toThrow(/alphabet/);
  });
});
