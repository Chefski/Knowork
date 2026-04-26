import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { applyMcpEntryJsonCustom, removeMcpEntryJsonCustom } from '../json-config.js';
import { gitRepoRoot } from '../scope.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

// Gemini CLI stores MCP servers in `settings.json` under `mcpServers`. Its
// remote HTTP examples and parser accept `httpUrl`, so we emit that field
// instead of Claude/Cursor's `url`.
export const geminiCliAdapter: AgentAdapter = {
  id: 'gemini-cli',
  displayName: 'Gemini CLI',
  supportsProjectScope: true,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return join(homedir(), '.gemini', 'settings.json');
    }
    return join(gitRepoRoot() ?? process.cwd(), '.gemini', 'settings.json');
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryJsonCustom(file, entry, {
      roomCode: opts.roomCode,
      containerKey: 'mcpServers',
      urlField: 'httpUrl',
    });
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryJsonCustom(file, { containerKey: 'mcpServers' });
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    if (process.env.GEMINI_CLI) signals.push('GEMINI_CLI set');
    if (existsSync(join(homedir(), '.gemini'))) signals.push('~/.gemini/ exists');
    return { present: signals.length > 0, signals };
  },
};
