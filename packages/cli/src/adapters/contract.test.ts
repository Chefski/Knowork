import { isAbsolute } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { McpEntry } from '../types.js';
import { ALL_ADAPTERS, MCP_ENTRY_KEY } from './index.js';
import type { AgentAdapter } from './types.js';

// Shared corpus that every adapter must satisfy. Iterating the registry means
// adding a new adapter automatically picks up coverage — no separate test file
// per adapter required.

const ENTRY: McpEntry = {
  url: 'https://knowork.app/mcp',
  headers: {},
};
const ROOM_A = 'AAAAAAAAAA';
const ROOM_B = 'BBBBBBBBBB';

// Different adapters use different syntactic shapes (JSON `"knowork":` vs TOML
// `name = "knowork"`), but every adapter references the key by its literal
// name somewhere — so a global count of `MCP_ENTRY_KEY` is a reliable
// "is the entry duplicated?" signal across formats.
function countEntryReferences(text: string): number {
  return text.split(MCP_ENTRY_KEY).length - 1;
}

describe.each(ALL_ADAPTERS.map((a) => [a.id, a] as const))(
  'adapter contract: %s',
  (_id, adapter: AgentAdapter) => {
    it('exposes id and displayName', () => {
      expect(adapter.id).toBeTruthy();
      expect(adapter.displayName).toBeTruthy();
    });

    it('applyMcpEntry(null) produces non-empty output containing the room code', () => {
      const out = adapter.applyMcpEntry(null, ENTRY, { roomCode: ROOM_A });
      expect(out.length).toBeGreaterThan(0);
      expect(out).toContain(ROOM_A);
    });

    it('applyMcpEntry is idempotent (apply twice == apply once)', () => {
      const once = adapter.applyMcpEntry(null, ENTRY, { roomCode: ROOM_A });
      const twice = adapter.applyMcpEntry(once, ENTRY, { roomCode: ROOM_A });
      expect(twice).toBe(once);
    });

    it('updates in place when re-applied with a different room code', () => {
      const first = adapter.applyMcpEntry(null, ENTRY, { roomCode: ROOM_A });
      const second = adapter.applyMcpEntry(first, ENTRY, { roomCode: ROOM_B });
      expect(second).toContain(ROOM_B);
      expect(second).not.toContain(ROOM_A);
      // Re-applying must update in place, not append a duplicate entry.
      expect(countEntryReferences(second)).toBe(countEntryReferences(first));
    });

    it('removeMcpEntry returns a string that no longer contains the room code', () => {
      const applied = adapter.applyMcpEntry(null, ENTRY, { roomCode: ROOM_A });
      const removed = adapter.removeMcpEntry(applied);
      expect(typeof removed).toBe('string');
      expect(removed).not.toContain(ROOM_A);
    });

    if (adapter.supportsProjectScope) {
      it('configPath returns distinct absolute paths for project vs global', () => {
        const project = adapter.configPath('project');
        const global = adapter.configPath('global');
        expect(typeof project).toBe('string');
        expect(typeof global).toBe('string');
        if (adapter.id === 'manual') {
          // Manual prints to stdout regardless of scope — same sentinel, not an absolute path.
          expect(project).toBe(global);
        } else {
          expect(project).not.toBe(global);
          expect(isAbsolute(project)).toBe(true);
          expect(isAbsolute(global)).toBe(true);
        }
      });
    } else {
      it('configPath("project") throws when project scope is unsupported', () => {
        expect(() => adapter.configPath('project')).toThrow();
        const global = adapter.configPath('global');
        expect(isAbsolute(global)).toBe(true);
      });
    }
  },
);

describe('registry', () => {
  it('contains at least the day-one agents', () => {
    const ids = ALL_ADAPTERS.map((a) => a.id);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('codex-cli');
    expect(ids).toContain('cursor');
    expect(ids).toContain('gemini-cli');
    expect(ids).toContain('vscode');
    expect(ids).toContain('windsurf');
    expect(ids).toContain('manual');
  });

  it('has unique ids', () => {
    const ids = ALL_ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
