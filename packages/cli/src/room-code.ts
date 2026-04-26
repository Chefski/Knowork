import { CliError } from './errors.js';

// Keep this in sync with packages/shared/src/schemas.ts. The CLI package is
// published standalone, so it cannot import private workspace-only packages.
const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/;
const ROOM_CODE_LENGTH = 10;

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
