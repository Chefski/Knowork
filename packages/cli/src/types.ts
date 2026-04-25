// `auto` means: project if inside a git repo and the adapter supports it,
// otherwise global. `project` and `global` are explicit overrides.
export type ScopeFlag = 'auto' | 'project' | 'global';

export type ResolvedScope = 'project' | 'global';

export interface McpEntry {
  url: string;
  token?: string;
  // Always includes X-Room-Code so existing servers that key off it keep working.
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

// Buffered before any file is touched so the CLI can print a summary and
// either apply them all or (for `--dry-run`) print diffs and exit.
export interface PlannedWrite {
  path: string;
  before: string | null;
  after: string | null;
  reason: string;
}
