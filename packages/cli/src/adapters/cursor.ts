import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { applyMcpEntryJson, removeMcpEntryJson } from '../json-config.js';
import { gitRepoRoot } from '../scope.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

// Cursor stores MCP config under a `.cursor/` directory at user-scope and
// project-scope. Both files use the same JSON shape as Claude Code (`mcpServers`
// keyed object) so we reuse the JSON writer.
export const cursorAdapter: AgentAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  supportsProjectScope: true,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return join(homedir(), '.cursor', 'mcp.json');
    }
    return join(gitRepoRoot() ?? process.cwd(), '.cursor', 'mcp.json');
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryJson(file, entry, opts);
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryJson(file);
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    // Cursor's integrated terminal sets TERM_PROGRAM=Cursor, which is the
    // single most reliable runtime signal we have access to.
    if (process.env.TERM_PROGRAM === 'Cursor') signals.push('TERM_PROGRAM=Cursor');
    if (existsSync(join(homedir(), '.cursor'))) {
      signals.push('~/.cursor/ exists');
    }
    return { present: signals.length > 0, signals };
  },
};
