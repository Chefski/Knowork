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

// Counts occurrences of the entry key in the produced config text. Different
// adapters use different syntactic shapes (JSON `"knowork":` vs TOML
// `name = "knowork"`), but every adapter we ship references the key by its
// literal name somewhere — so a global count of `MCP_ENTRY_KEY` is a reliable
// "is the entry duplicated?" signal across formats.
function countEntryReferences(text: string): number {
  // Use a regex with `g` flag built from the literal key. The key is a fixed
  // identifier (`knowork`) so escaping isn't needed in practice, but we still
  // build it dynamically in case it ever changes.
  const escaped = MCP_ENTRY_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(escaped, 'g')) ?? [];
  return matches.length;
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
      // Exactly one entry, no duplicates. The manual adapter's output is a
      // standalone snippet — `null` input and a non-null input both produce a
      // single entry — so this assertion holds across formats.
      const firstCount = countEntryReferences(first);
      const secondCount = countEntryReferences(second);
      expect(secondCount).toBe(firstCount);
    });

    it('removeMcpEntry returns a string that no longer contains the room code', () => {
      const applied = adapter.applyMcpEntry(null, ENTRY, { roomCode: ROOM_A });
      const removed = adapter.removeMcpEntry(applied);
      expect(typeof removed).toBe('string');
      expect(removed).not.toContain(ROOM_A);
    });

    if (adapter.supportsProjectScope) {
      it('configPath returns distinct absolute paths for project vs global', () => {
        // The manual adapter returns a sentinel string (not an absolute path);
        // skip the absolute-path assertion for it but still require distinct
        // values are well-defined and deterministic across the two scopes
        // OR identical (manual prints to stdout regardless of scope).
        const project = adapter.configPath('project');
        const global = adapter.configPath('global');
        expect(typeof project).toBe('string');
        expect(typeof global).toBe('string');
        if (adapter.id === 'manual') {
          // Manual prints to stdout regardless of scope — same sentinel.
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
        // Global must still resolve to an absolute path.
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
    expect(ids).toContain('manual');
  });

  it('has unique ids', () => {
    const ids = ALL_ADAPTERS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
