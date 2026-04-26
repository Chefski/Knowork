import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { applyMcpEntryJsonCustom, removeMcpEntryJsonCustom } from '../json-config.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

// Windsurf/Cascade keeps MCP servers in a user-scope Codeium config file.
// It does not currently have a documented project-scope MCP config, so callers
// should fall back to global scope.
export const windsurfAdapter: AgentAdapter = {
  id: 'windsurf',
  displayName: 'Windsurf',
  supportsProjectScope: false,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
    }
    throw new Error('windsurf does not support project scope; use --global or omit the flag.');
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryJsonCustom(file, entry, {
      roomCode: opts.roomCode,
      containerKey: 'mcpServers',
      urlField: 'serverUrl',
    });
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryJsonCustom(file, { containerKey: 'mcpServers' });
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    if (process.env.TERM_PROGRAM === 'Windsurf') signals.push('TERM_PROGRAM=Windsurf');
    if (process.env.WINDSURF) signals.push('WINDSURF set');
    if (existsSync(join(homedir(), '.codeium', 'windsurf'))) {
      signals.push('~/.codeium/windsurf/ exists');
    }
    return { present: signals.length > 0, signals };
  },
};
