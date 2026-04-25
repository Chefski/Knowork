// Single source of truth for the Knowork protocol guidance shown to agents.
// Consumed by:
//   - apps/server/src/mcp/server.ts (passed as `instructions` on the MCP server)
//   - packages/cli                  (written into CLAUDE.md / AGENTS.md / equivalent)
//   - apps/web                      (rendered in the Connect-agent panel)
//
// CHANGES TO THIS TEXT REWRITE EVERY MANAGED RULES-FILE REGION on the next
// `knowork connect`. Keep edits intentional.

export const KNOWORK_PROTOCOL_TEXT = `## Knowork — agent presence board

Use the **Knowork** MCP server (\`agent-presence-board\`) for every non-trivial task in this or any repo. The room code is passed as the \`room\` argument on every tool call.

1. **Before starting work**, call \`check_overlap\` with the room code, repo, intent, and any files you'll touch. If a teammate's agent is already on it, stop and tell the user.
2. Call \`start_work\` to announce. Keep the returned \`work_id\`.
3. Call \`complete_work(work_id, summary)\` when done.

Presence is automatic while your MCP session is connected — you don't need to heartbeat.

Skip the dance for trivial questions and read-only lookups.
`;

// Stable comment markers used by the CLI to delimit the managed region inside
// CLAUDE.md / AGENTS.md / equivalent rules files. Anything outside the markers
// belongs to the user and is never touched.
export const KNOWORK_RULES_START_MARKER = '<!-- knowork:start -->';
export const KNOWORK_RULES_END_MARKER = '<!-- knowork:end -->';

// The full marker-bounded block written into a rules file. The blank lines
// around the markers exist so that re-running `connect` and then `disconnect`
// returns the surrounding file to its original byte-shape.
export function knoworkRulesBlock(): string {
  return `${KNOWORK_RULES_START_MARKER}\n${KNOWORK_PROTOCOL_TEXT}${KNOWORK_RULES_END_MARKER}\n`;
}
