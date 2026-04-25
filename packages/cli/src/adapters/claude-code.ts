import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { applyMcpEntryJson, removeMcpEntryJson } from '../json-config.js';
import { gitRepoRoot } from '../scope.js';
import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';

// Claude Code reads `~/.claude/.mcp.json` for user-scope and `<repo>/.mcp.json`
// for project-scope. Note the leading dot in the user-scope filename — that's
// the file Claude Code actually loads.
export const claudeCodeAdapter: AgentAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  supportsProjectScope: true,

  configPath(scope: ResolvedScope): string {
    if (scope === 'global') {
      return join(homedir(), '.claude', '.mcp.json');
    }
    // Prefer the git repo root so the same project-scope path resolves the
    // same way regardless of which subdirectory the user invoked us from.
    return join(gitRepoRoot() ?? process.cwd(), '.mcp.json');
  },

  applyMcpEntry(file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    return applyMcpEntryJson(file, entry, opts);
  },

  removeMcpEntry(file: string): string {
    return removeMcpEntryJson(file);
  },

  async detect(): Promise<DetectionResult> {
    const signals: string[] = [];
    if (process.env.CLAUDECODE === '1') signals.push('CLAUDECODE=1');
    if (process.env.CLAUDE_CODE_AGENT) signals.push('CLAUDE_CODE_AGENT set');
    // The `~/.claude/` directory is created the first time the user runs
    // Claude Code, so its presence is a strong (but not env-bound) signal.
    if (existsSync(join(homedir(), '.claude'))) {
      signals.push('~/.claude/ exists');
    }
    return { present: signals.length > 0, signals };
  },
};
