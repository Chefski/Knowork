import type { McpEntry } from './types.js';
import { MCP_ENTRY_KEY } from './adapters/types.js';

// Codex CLI's `~/.codex/config.toml` is full TOML — but we only need to find
// or replace exactly one `[[mcp_servers]]` table-array entry whose
// `name = "<key>"`. Pulling in a full TOML parser would be overkill and would
// reformat unrelated content; instead we slice the file into "chunks" that
// each correspond to one top-level table or table-array (carrying any nested
// sub-tables like `[mcp_servers.headers]` along with their parent) and rewrite
// only ours.

interface Chunk {
  // Lines belonging to this chunk, including its first header line. The
  // preamble chunk (anything before the first table header) has empty
  // `firstHeader`.
  firstHeader: string;
  lines: string[];
  // For `[[mcp_servers]]` chunks, the parsed `name = "..."` value if any.
  mcpServerName: string | null;
}

const TABLE_ARRAY_RE = /^\s*\[\[\s*([^\]]+?)\s*\]\]\s*(#.*)?$/;
const TABLE_RE = /^\s*\[\s*([^\[\]]+?)\s*\]\s*(#.*)?$/;
const NAME_LINE_RE = /^\s*name\s*=\s*"([^"]*)"/;

function parseHeader(line: string): { kind: 'array' | 'table'; path: string } | null {
  const arrayMatch = TABLE_ARRAY_RE.exec(line);
  if (arrayMatch && arrayMatch[1] !== undefined) {
    return { kind: 'array', path: arrayMatch[1].trim() };
  }
  const tableMatch = TABLE_RE.exec(line);
  if (tableMatch && tableMatch[1] !== undefined) {
    return { kind: 'table', path: tableMatch[1].trim() };
  }
  return null;
}

// Split the file into chunks. A chunk starts at a table/table-array header.
// Sub-tables whose dotted path starts with the parent's path (e.g.
// `[mcp_servers.headers]` after `[[mcp_servers]]`) attach to the parent chunk
// so removing/replacing the parent removes/replaces the sub-tables too.
function splitChunks(text: string): Chunk[] {
  const lines = text.length === 0 ? [] : text.split('\n');
  const chunks: Chunk[] = [];
  let current: Chunk = { firstHeader: '', lines: [], mcpServerName: null };
  let currentParentPath: string | null = null;

  for (const line of lines) {
    const header = parseHeader(line);
    if (header) {
      const isSubOfCurrent =
        currentParentPath !== null &&
        header.kind === 'table' &&
        header.path.startsWith(currentParentPath + '.');

      if (isSubOfCurrent) {
        // Treat this sub-table as part of the current chunk.
        current.lines.push(line);
        continue;
      }

      // New top-level chunk.
      chunks.push(current);
      current = { firstHeader: line, lines: [line], mcpServerName: null };
      currentParentPath = header.path;
    } else {
      current.lines.push(line);
      // Capture the `name = "..."` field only if this chunk is an
      // `[[mcp_servers]]` array entry and we haven't crossed into a sub-table
      // yet. We detect "still in the parent body" by checking the most recent
      // header line in the chunk.
      if (
        current.mcpServerName === null &&
        currentParentPath === 'mcp_servers' &&
        TABLE_ARRAY_RE.test(current.firstHeader) &&
        !lineFollowsSubTable(current.lines)
      ) {
        const m = NAME_LINE_RE.exec(line);
        if (m) current.mcpServerName = m[1] ?? null;
      }
    }
  }
  chunks.push(current);
  return chunks;
}

// True if the most-recent header in `lines` is a sub-table (`[x.y]`) rather
// than the chunk's array header (`[[x]]`). Used to scope `name = "..."`
// detection to the parent body only — a `name` field inside
// `[mcp_servers.headers]` would be a header value, not the server name.
function lineFollowsSubTable(lines: string[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    const h = parseHeader(line);
    if (!h) continue;
    return h.kind === 'table';
  }
  return false;
}

function joinChunks(chunks: Chunk[]): string {
  const all: string[] = [];
  for (const c of chunks) {
    all.push(...c.lines);
  }
  return all.join('\n');
}

function tomlEscape(value: string): string {
  // Codex config values are simple strings (URLs, header values); escape only
  // backslash and quote. Anything else can pass through.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const HEADER_KV_RE = /^\s*([A-Za-z][A-Za-z0-9._-]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/;
const HEADERS_TABLE_RE = /^\s*\[\s*mcp_servers\.headers\s*\]\s*(#.*)?$/;

// Extract user-added header key/value pairs from an existing knowork chunk's
// `[mcp_servers.headers]` sub-table. Returns an empty record when the
// sub-table is absent or no recognisable `key = "value"` lines are present.
// Does NOT preserve comments or formatting — those are dropped on rewrite,
// which matches the existing behavior for the knowork-managed chunk; the
// trade-off is documented in the README.
function extractExistingHeaders(chunk: Chunk): Record<string, string> {
  const headers: Record<string, string> = {};
  let inHeadersTable = false;
  for (const line of chunk.lines) {
    if (HEADERS_TABLE_RE.test(line)) {
      inHeadersTable = true;
      continue;
    }
    if (!inHeadersTable) continue;
    // Any other table header ends the headers sub-table.
    const h = parseHeader(line);
    if (h) break;
    const m = HEADER_KV_RE.exec(line);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      // Reverse the toml escape: \\ -> \, \" -> "
      const value = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      headers[m[1]] = value;
    }
  }
  return headers;
}

function buildChunkLines(
  entry: McpEntry,
  opts: { roomCode: string; name: string; preservedHeaders?: Record<string, string> },
): string[] {
  // Merge order (last wins): preserved user headers from the existing chunk
  // (if any) → caller-supplied entry.headers → knowork-managed
  // (X-Room-Code, Authorization). Knowork-managed always wins, so a stale
  // X-Room-Code that the user typed manually gets corrected on re-run.
  const headers: Record<string, string> = {
    ...(opts.preservedHeaders ?? {}),
    ...entry.headers,
  };
  headers['X-Room-Code'] = opts.roomCode;
  if (entry.token) {
    headers['Authorization'] = `Bearer ${entry.token}`;
  }
  const lines: string[] = [
    '[[mcp_servers]]',
    `name = "${tomlEscape(opts.name)}"`,
    'transport = "http"',
    `url = "${tomlEscape(entry.url)}"`,
  ];
  const headerKeys = Object.keys(headers);
  if (headerKeys.length > 0) {
    lines.push('[mcp_servers.headers]');
    for (const k of headerKeys) {
      const v = headers[k];
      if (v === undefined) continue;
      lines.push(`${k} = "${tomlEscape(v)}"`);
    }
  }
  return lines;
}

export function applyMcpEntryToml(
  existing: string | null,
  entry: McpEntry,
  opts: { roomCode: string; name?: string },
): string {
  const name = opts.name ?? MCP_ENTRY_KEY;

  if (existing === null || existing.length === 0) {
    const newLines = buildChunkLines(entry, { roomCode: opts.roomCode, name });
    return newLines.join('\n') + '\n';
  }

  const chunks = splitChunks(existing);
  const target = chunks.find((c) => {
    const h = parseHeader(c.firstHeader);
    return h?.kind === 'array' && h.path === 'mcp_servers' && c.mcpServerName === name;
  });

  // Preserve any user-added headers in the existing knowork chunk so re-running
  // connect doesn't drop a custom header (e.g. corp proxy auth) the user added
  // by hand. knowork-managed headers (X-Room-Code, Authorization) still win.
  const preservedHeaders = target ? extractExistingHeaders(target) : undefined;
  const newLines = buildChunkLines(entry, { roomCode: opts.roomCode, name, preservedHeaders });

  if (target) {
    // Preserve any trailing blank lines that belonged to the old chunk so
    // separation from the next chunk (or trailing newline at EOF) is
    // preserved across replacements — that's what makes apply-twice
    // byte-identical.
    const trailingBlanks: string[] = [];
    for (let i = target.lines.length - 1; i >= 0; i--) {
      const line = target.lines[i];
      if (line === undefined) break;
      if (line === '') trailingBlanks.unshift(line);
      else break;
    }
    target.lines = [...newLines, ...trailingBlanks];
    target.mcpServerName = name;
    return joinChunks(chunks);
  }

  // Append a new chunk. Ensure the file ends with `\n` before the new header
  // so we don't merge into the previous chunk, and finish with a single
  // trailing newline.
  let prefix = existing;
  if (!prefix.endsWith('\n')) prefix += '\n';
  if (!prefix.endsWith('\n\n') && prefix.length > 0) prefix += '\n';
  return prefix + newLines.join('\n') + '\n';
}

export function removeMcpEntryToml(existing: string, name?: string): string {
  const target = name ?? MCP_ENTRY_KEY;
  if (existing.length === 0) return existing;

  const chunks = splitChunks(existing);
  const idx = chunks.findIndex((c) => {
    const h = parseHeader(c.firstHeader);
    return h?.kind === 'array' && h.path === 'mcp_servers' && c.mcpServerName === target;
  });
  if (idx === -1) return existing;

  chunks.splice(idx, 1);
  let out = joinChunks(chunks);
  // Collapse runs of three-or-more consecutive newlines (introduced by
  // removing a chunk sandwiched between others) back to two — i.e. one blank
  // separator line.
  out = out.replace(/\n{3,}/g, '\n\n');
  if (out.trim().length === 0) return '';
  return out;
}
