import { describe, expect, it } from 'vitest';
import {
  KNOWORK_PROTOCOL_TEXT as SHARED_PROTOCOL_TEXT,
  KNOWORK_RULES_END_MARKER as SHARED_RULES_END_MARKER,
  KNOWORK_RULES_START_MARKER as SHARED_RULES_START_MARKER,
} from '../../shared/src/protocol-text.js';
import {
  KNOWORK_PROTOCOL_TEXT,
  KNOWORK_RULES_END_MARKER,
  KNOWORK_RULES_START_MARKER,
} from './protocol-text.js';

describe('packaged protocol text', () => {
  it('stays in sync with the shared server/web protocol text', () => {
    expect(KNOWORK_PROTOCOL_TEXT).toBe(SHARED_PROTOCOL_TEXT);
    expect(KNOWORK_RULES_START_MARKER).toBe(SHARED_RULES_START_MARKER);
    expect(KNOWORK_RULES_END_MARKER).toBe(SHARED_RULES_END_MARKER);
  });
});
