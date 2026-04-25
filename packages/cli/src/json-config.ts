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

// Mirror the existing `.mcp.json` shape in this repo: `type: "http"` (some
// other clients use `transport: "http"` instead — we only emit `type` here,
// matching what Claude Code reads). Headers always include X-Room-Code so the
// server keeps working for clients that key off it.
export function applyMcpEntryJson(
  existing: string | null,
  entry: McpEntry,
  opts: { roomCode: string; key?: string },
): string {
  const key = opts.key ?? MCP_ENTRY_KEY;
  const config: JsonConfigShape =
    existing === null || existing.trim().length === 0
      ? {}
      : (JSON.parse(existing) as JsonConfigShape);

  const mcpServers = config.mcpServers ?? {};

  // Preserve any user-added headers on the existing entry by merging on top of
  // them. knowork-managed headers (X-Room-Code, Authorization) always win, so
  // re-running connect updates the room code / token without dropping the
  // user's custom headers (e.g. proxy auth). entry.headers (from caller) layer
  // in between user headers and managed headers.
  const existingEntry = mcpServers[key];
  const headers: Record<string, string> = {
    ...(existingEntry?.headers ?? {}),
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
  const k = key ?? MCP_ENTRY_KEY;
  if (existing.trim().length === 0) return existing;

  const config = JSON.parse(existing) as JsonConfigShape;
  if (config.mcpServers && k in config.mcpServers) {
    delete config.mcpServers[k];
  }
  return JSON.stringify(config, null, 2) + '\n';
}
