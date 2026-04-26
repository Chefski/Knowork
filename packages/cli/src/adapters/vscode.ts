import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { applyMcpEntryJsonCustom, removeMcpEntryJsonCustom } from '../json-config.js';
import { gitRepoRoot } from '../scope.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

function vscodeUserMcpPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Code', 'User', 'mcp.json');
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(configHome, 'Code', 'User', 'mcp.json');
}

function vscodeUserDir(): string {
  return dirname(vscodeUserMcpPath());
}

// VS Code uses `.vscode/mcp.json` for workspace MCP configuration and a
// top-level `servers` object instead of the `mcpServers` object used by many
// standalone coding agents.
export const vscodeAdapter: AgentAdapter = {
  id: 'vscode',
  displayName: 'VS Code',
  supportsProjectScope: true,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return vscodeUserMcpPath();
    }
    return join(gitRepoRoot() ?? process.cwd(), '.vscode', 'mcp.json');
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryJsonCustom(file, entry, {
      roomCode: opts.roomCode,
      containerKey: 'servers',
      urlField: 'url',
      typeField: 'type',
    });
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryJsonCustom(file, { containerKey: 'servers' });
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    if (process.env.TERM_PROGRAM === 'vscode') signals.push('TERM_PROGRAM=vscode');
    if (process.env.VSCODE_PID) signals.push('VSCODE_PID set');
    if (process.env.VSCODE_CWD) signals.push('VSCODE_CWD set');
    if (existsSync(vscodeUserDir())) signals.push('VS Code user config dir exists');
    return { present: signals.length > 0, signals };
  },
};
