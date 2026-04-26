import type { McpEntry } from './types.js';
import { MCP_ENTRY_KEY } from './adapters/types.js';

interface JsonMcpEntry {
  type?: string;
  transport?: string;
  url?: string;
  httpUrl?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  [extra: string]: unknown;
}

interface JsonConfigShape {
  mcpServers?: Record<string, JsonMcpEntry>;
  servers?: Record<string, JsonMcpEntry>;
  [extra: string]: unknown;
}

interface JsonMcpEntryOptions {
  roomCode: string;
  key?: string;
  containerKey?: 'mcpServers' | 'servers';
  urlField?: 'url' | 'httpUrl' | 'serverUrl';
  typeField?: 'type' | 'transport';
}

// We emit `type: "http"` (not `transport: "http"`) to match what Claude Code
// reads from `.mcp.json`.
export function applyMcpEntryJson(
  existing: string | null,
  entry: McpEntry,
  opts: { roomCode: string; key?: string },
): string {
  return applyMcpEntryJsonCustom(existing, entry, {
    ...opts,
    containerKey: 'mcpServers',
    urlField: 'url',
    typeField: 'type',
  });
}

export function applyMcpEntryJsonCustom(
  existing: string | null,
  entry: McpEntry,
  opts: JsonMcpEntryOptions,
): string {
  const key = opts.key ?? MCP_ENTRY_KEY;
  const containerKey = opts.containerKey ?? 'mcpServers';
  const urlField = opts.urlField ?? 'url';
  const isEmpty = existing === null || existing.trim().length === 0;
  const config: JsonConfigShape = isEmpty ? {} : (JSON.parse(existing) as JsonConfigShape);

  const servers = config[containerKey] ?? {};

  // Merge order (lowest to highest precedence): existing user headers, caller
  // headers, knowork-managed headers. Re-running connect updates room code /
  // token without dropping the user's custom headers (e.g. proxy auth).
  const headers: Record<string, string> = {
    ...servers[key]?.headers,
    ...entry.headers,
  };
  headers['X-Room-Code'] = opts.roomCode;
  if (entry.token) {
    headers['Authorization'] = `Bearer ${entry.token}`;
  }

  const nextEntry: JsonMcpEntry = {};
  if (opts.typeField) {
    nextEntry[opts.typeField] = 'http';
  }
  nextEntry[urlField] = entry.url;
  nextEntry.headers = headers;

  servers[key] = nextEntry;
  config[containerKey] = servers;

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

export function removeMcpEntryJsonCustom(
  existing: string,
  opts: { key?: string; containerKey?: 'mcpServers' | 'servers' },
): string {
  if (existing.trim().length === 0) return existing;

  const resolvedKey = opts.key ?? MCP_ENTRY_KEY;
  const containerKey = opts.containerKey ?? 'mcpServers';
  const config = JSON.parse(existing) as JsonConfigShape;
  if (config[containerKey] && resolvedKey in config[containerKey]) {
    delete config[containerKey][resolvedKey];
  }
  return JSON.stringify(config, null, 2) + '\n';
}
