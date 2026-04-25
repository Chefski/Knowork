import type { McpEntry, ResolvedScope } from '../types.js';

// Keep stable: changing it breaks idempotency for users who already ran a
// previous CLI version. Used inside JSON config (e.g. `mcpServers.knowork`)
// and TOML name field (`[[mcp_servers]] name = "knowork"`).
export const MCP_ENTRY_KEY = 'knowork';

export interface DetectionResult {
  present: boolean;
  // Empty `signals` with `present: false` means "no evidence found".
  signals: string[];
}

export interface AgentAdapter {
  id: string;
  displayName: string;

  detect(): Promise<DetectionResult>;

  // Throws if the adapter doesn't support the requested scope (callers
  // should consult `supportsProjectScope` first).
  configPath(scope: ResolvedScope): string;

  supportsProjectScope: boolean;

  // `file` is `null` when the target config does not exist yet.
  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string;

  // Returning `""` signals "the file would be empty after removal — caller
  // may delete it instead of writing an empty file."
  removeMcpEntry(file: string): string;
}
