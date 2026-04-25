import type { McpEntry, ResolvedScope } from '../types.js';

// Key used inside JSON config (e.g. `mcpServers.knowork`) and TOML name field
// (`[[mcp_servers]] name = "knowork"`). Keep stable: changing it breaks
// idempotency for users who already ran a previous CLI version.
export const MCP_ENTRY_KEY = 'knowork';

// Best-effort signals the adapter found that suggest this agent is the active
// one. Empty `signals` with `present: false` means "no evidence found".
export interface DetectionResult {
  present: boolean;
  signals: string[];
}

export interface AgentAdapter {
  // Stable identifier used for `--agent <id>` and registry lookups.
  id: string;
  displayName: string;

  detect(): Promise<DetectionResult>;

  // Absolute path to the config file for the given scope. Throws if the
  // adapter doesn't support the requested scope (callers should consult
  // `supportsProjectScope` first).
  configPath(scope: ResolvedScope): string;

  supportsProjectScope: boolean;

  // Returns the new file contents after applying the knowork MCP entry.
  // `file` is `null` when the target config does not exist yet.
  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string;

  // Returns the new file contents after removing the knowork MCP entry.
  // Returning `""` signals "the file would be empty after removal — caller
  // may delete it instead of writing an empty file."
  removeMcpEntry(file: string): string;
}
