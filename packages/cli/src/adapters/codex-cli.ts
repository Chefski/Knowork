import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { applyMcpEntryToml, removeMcpEntryToml } from '../toml-config.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

// Codex CLI has only a single user-scope config at `~/.codex/config.toml`.
// There is no historical project-scope MCP config for it, so
// `supportsProjectScope` is false and `configPath('project')` throws — callers
// should consult `supportsProjectScope` and fall back to global before asking
// for a project path.
export const codexCliAdapter: AgentAdapter = {
  id: 'codex-cli',
  displayName: 'Codex CLI',
  supportsProjectScope: false,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return join(homedir(), '.codex', 'config.toml');
    }
    throw new Error(
      'codex-cli does not support project scope; use --global or omit the flag.',
    );
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryToml(file, entry, opts);
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryToml(file);
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    if (process.env.CODEX_CLI) signals.push('CODEX_CLI set');
    if (existsSync(join(homedir(), '.codex'))) {
      signals.push('~/.codex/ exists');
    }
    return { present: signals.length > 0, signals };
  },
};
