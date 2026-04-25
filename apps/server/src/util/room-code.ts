import { randomBytes } from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '@apb/shared';

const CODE_LEN = 6;

export function generateRoomCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  }
  return out;
}
