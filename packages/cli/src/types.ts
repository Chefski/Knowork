// `auto` means: project if inside a git repo and the adapter supports it,
// otherwise global. `project` and `global` are explicit overrides.
export type ScopeFlag = 'auto' | 'project' | 'global';

// Resolved scope passed to adapters once detection has run.
export type ResolvedScope = 'project' | 'global';

export interface McpEntry {
  // Server URL, e.g. "https://knowork.app/mcp".
  url: string;
  // Optional token to embed as `Authorization: Bearer <token>`.
  token?: string;
  // Headers other than Authorization. Currently always includes X-Room-Code so
  // existing servers that key off it keep working.
  headers: Record<string, string>;
}

export interface ConnectOptions {
  roomCode: string;
  server?: string;
  agent?: string;
  password?: string;
  scope: ScopeFlag;
  allowTokenInRepo: boolean;
  writeRulesFile: boolean;
  dryRun: boolean;
  assumeYes: boolean;
}

export interface DisconnectOptions {
  agent?: string;
  scope: ScopeFlag;
  writeRulesFile: boolean;
  dryRun: boolean;
  assumeYes: boolean;
}

// One planned write computed before any file is touched. The CLI buffers all
// of these, prints the summary, then either applies them all or (for
// `--dry-run`) prints diffs and exits.
export interface PlannedWrite {
  path: string;
  before: string | null;
  after: string | null;
  reason: string;
}
