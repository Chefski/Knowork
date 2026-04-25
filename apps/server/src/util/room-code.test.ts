import { describe, expect, it } from 'vitest';
import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '@apb/shared';
import { generateRoomCode } from './room-code.js';

describe('generateRoomCode', () => {
  it('returns codes of the configured length matching the shared room alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(ROOM_CODE_PATTERN.test(code)).toBe(true);
    }
  });
});
