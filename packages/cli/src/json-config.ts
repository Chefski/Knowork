import type { McpEntry } from './types.js';
import { MCP_ENTRY_KEY } from './adapters/types.js';

interface JsonMcpEntry {
  type?: string;
  transport?: string;
  url: string;
  headers?: Record<string, string>;
  [extra: string]: unknown;
}

interface JsonConfigShape {
  mcpServers?: Record<string, JsonMcpEntry>;
  [extra: string]: unknown;
}

// We emit `type: "http"` (not `transport: "http"`) to match what Claude Code
// reads from `.mcp.json`.
export function applyMcpEntryJson(
  existing: string | null,
  entry: McpEntry,
  opts: { roomCode: string; key?: string },
): string {
  const key = opts.key ?? MCP_ENTRY_KEY;
  const isEmpty = existing === null || existing.trim().length === 0;
  const config: JsonConfigShape = isEmpty
    ? {}
    : (JSON.parse(existing) as JsonConfigShape);

  const mcpServers = config.mcpServers ?? {};

  // Merge order (lowest to highest precedence): existing user headers, caller
  // headers, knowork-managed headers. Re-running connect updates room code /
  // token without dropping the user's custom headers (e.g. proxy auth).
  const headers: Record<string, string> = {
    ...mcpServers[key]?.headers,
    ...entry.headers,
  };
  headers['X-Room-Code'] = opts.roomCode;
  if (entry.token) {
    headers['Authorization'] = `Bearer ${entry.token}`;
  }

  mcpServers[key] = {
    type: 'http',
    url: entry.url,
    headers,
  };

  config.mcpServers = mcpServers;

  return JSON.stringify(config, null, 2) + '\n';
}

export function removeMcpEntryJson(existing: string, key?: string): string {
  if (existing.trim().length === 0) return existing;

  const resolvedKey = key ?? MCP_ENTRY_KEY;
  const config = JSON.parse(existing) as JsonConfigShape;
  if (config.mcpServers && resolvedKey in config.mcpServers) {
    delete config.mcpServers[resolvedKey];
  }
  return JSON.stringify(config, null, 2) + '\n';
}
