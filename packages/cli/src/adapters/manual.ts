import type { McpEntry, ResolvedScope } from '../types.js';
import type { AgentAdapter, DetectionResult } from './types.js';
import { MCP_ENTRY_KEY } from './types.js';

// The manual adapter never writes a config file. `applyMcpEntry` returns a
// JSON snippet (matching the Claude Code shape) for human consumption — the
// connect command prints it to stdout instead of writing it. `configPath`
// returns a sentinel string so callers that just print "wrote to <path>" don't
// crash; the connect command should branch on `adapter.id === 'manual'` to
// suppress the file-write path entirely.
const PRINTED_SENTINEL = '(printed to stdout — no file written)';

export const manualAdapter: AgentAdapter = {
  id: 'manual',
  displayName: 'Manual (print snippet only)',
  supportsProjectScope: true,

  configPath(_scope: ResolvedScope): string {
    return PRINTED_SENTINEL;
  },

  applyMcpEntry(_file: string | null, entry: McpEntry, opts: { roomCode: string }): string {
    const headers: Record<string, string> = { ...entry.headers };
    headers['X-Room-Code'] = opts.roomCode;
    if (entry.token) {
      headers['Authorization'] = `Bearer ${entry.token}`;
    }
    return (
      JSON.stringify(
        {
          mcpServers: {
            [MCP_ENTRY_KEY]: {
              type: 'http',
              url: entry.url,
              headers,
            },
          },
        },
        null,
        2,
      ) + '\n'
    );
  },

  removeMcpEntry(_file: string): string {
    return '';
  },

  async detect(): Promise<DetectionResult> {
    // Never auto-select. Only available via explicit `--agent manual`.
    return { present: false, signals: [] };
  },
};
