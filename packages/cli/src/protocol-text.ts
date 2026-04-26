// Keep this text in sync with packages/shared/src/protocol-text.ts.
// The CLI package is published standalone, so it cannot import private
// workspace-only packages at runtime.

export const KNOWORK_PROTOCOL_TEXT = `## Knowork — agent presence board

Use the **Knowork** MCP server (\`agent-presence-board\`) for every non-trivial task in this or any repo. The room code is passed as the \`room\` argument on every tool call.

1. **Before starting work**, call \`check_overlap\` with the room code, repo, intent, and any files you'll touch. If a teammate's agent is already on it, stop and tell the user.
2. Call \`start_work\` to announce. Keep the returned \`work_id\`.
3. Call \`complete_work(work_id, summary)\` when done.

Presence is automatic while your MCP session is connected — you don't need to heartbeat.

Skip the dance for trivial questions and read-only lookups.
`;

export const KNOWORK_RULES_START_MARKER = '<!-- knowork:start -->';
export const KNOWORK_RULES_END_MARKER = '<!-- knowork:end -->';

export function knoworkRulesBlock(): string {
  return `${KNOWORK_RULES_START_MARKER}\n${KNOWORK_PROTOCOL_TEXT}${KNOWORK_RULES_END_MARKER}\n`;
}
