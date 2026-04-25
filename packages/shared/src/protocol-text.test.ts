import { describe, expect, it } from 'vitest';
import {
  KNOWORK_PROTOCOL_TEXT,
  KNOWORK_RULES_START_MARKER,
  KNOWORK_RULES_END_MARKER,
  knoworkRulesBlock,
} from './protocol-text.js';

describe('KNOWORK_PROTOCOL_TEXT', () => {
  it('snapshot — accidental edits to protocol text rewrite every managed rules-file region on the next `knowork connect`. Update intentionally.', () => {
    expect(KNOWORK_PROTOCOL_TEXT).toMatchInlineSnapshot(`
      "## Knowork — agent presence board

      Use the **Knowork** MCP server (\`agent-presence-board\`) for every non-trivial task in this or any repo. The room code is passed as the \`room\` argument on every tool call.

      1. **Before starting work**, call \`check_overlap\` with the room code, repo, intent, and any files you'll touch. If a teammate's agent is already on it, stop and tell the user.
      2. Call \`start_work\` to announce. Keep the returned \`work_id\`.
      3. Call \`complete_work(work_id, summary)\` when done.

      Presence is automatic while your MCP session is connected — you don't need to heartbeat.

      Skip the dance for trivial questions and read-only lookups.
      "
    `);
  });

  it('mentions the core protocol tool names', () => {
    for (const tool of ['check_overlap', 'start_work', 'complete_work']) {
      expect(KNOWORK_PROTOCOL_TEXT).toContain(tool);
    }
  });

  it('does not instruct agents to heartbeat manually', () => {
    expect(KNOWORK_PROTOCOL_TEXT).not.toMatch(/heartbeat\(/);
  });

  it('exposes stable comment markers', () => {
    expect(KNOWORK_RULES_START_MARKER).toBe('<!-- knowork:start -->');
    expect(KNOWORK_RULES_END_MARKER).toBe('<!-- knowork:end -->');
  });

  it('knoworkRulesBlock() embeds the protocol text between the markers', () => {
    const block = knoworkRulesBlock();
    expect(block.startsWith(KNOWORK_RULES_START_MARKER + '\n')).toBe(true);
    expect(block.endsWith(KNOWORK_RULES_END_MARKER + '\n')).toBe(true);
    expect(block).toContain(KNOWORK_PROTOCOL_TEXT);
  });
});
