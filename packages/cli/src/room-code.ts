import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '@apb/shared';
import { CliError } from './errors.js';

// Validates and normalizes a room code argument. The shared pattern is the
// single source of truth (see packages/shared/src/schemas.ts) — we don't
// duplicate the alphabet here.

export function normalizeRoomCode(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== ROOM_CODE_LENGTH) {
    throw new CliError(
      `Room code "${input}" is ${trimmed.length} characters; expected ${ROOM_CODE_LENGTH}.`,
      { remediation: 'Copy the code from the room URL or the web UI header.' },
    );
  }
  if (!ROOM_CODE_PATTERN.test(trimmed)) {
    throw new CliError(
      `Room code "${input}" contains characters outside the Knowork alphabet (no 0/O/1/I/L).`,
      { remediation: 'Copy the code from the room URL or the web UI header.' },
    );
  }
  return trimmed;
}
