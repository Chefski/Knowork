import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '@apb/shared';
import { CliError } from './errors.js';

// The shared pattern is the single source of truth (see
// packages/shared/src/schemas.ts) — we don't duplicate the alphabet here.

const REMEDIATION = 'Copy the code from the room URL or the web UI header.';

export function normalizeRoomCode(input: string): string {
  const trimmed = input.trim().toUpperCase();
  if (trimmed.length !== ROOM_CODE_LENGTH) {
    throw new CliError(
      `Room code "${input}" is ${trimmed.length} characters; expected ${ROOM_CODE_LENGTH}.`,
      { remediation: REMEDIATION },
    );
  }
  if (!ROOM_CODE_PATTERN.test(trimmed)) {
    throw new CliError(
      `Room code "${input}" contains characters outside the Knowork alphabet (no 0/O/1/I/L).`,
      { remediation: REMEDIATION },
    );
  }
  return trimmed;
}
