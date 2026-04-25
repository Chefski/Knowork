import { describe, expect, it } from 'vitest';
import { applyMcpEntryToml, removeMcpEntryToml } from './toml-config.js';
import type { McpEntry } from './types.js';

const entry: McpEntry = {
  url: 'https://knowork.app/mcp',
  headers: {},
};
const ROOM = 'ABCDEFGHIJ';

describe('applyMcpEntryToml', () => {
  it('creates a TOML file from null', () => {
    const out = applyMcpEntryToml(null, entry, { roomCode: ROOM });
    expect(out).toContain('[[mcp_servers]]');
    expect(out).toContain('name = "knowork"');
    expect(out).toContain('transport = "http"');
    expect(out).toContain('url = "https://knowork.app/mcp"');
    expect(out).toContain('[mcp_servers.headers]');
    expect(out).toContain(`X-Room-Code = "${ROOM}"`);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('embeds Authorization header when a token is present', () => {
    const out = applyMcpEntryToml(
      null,
      { ...entry, token: 'tok-1' },
      { roomCode: ROOM },
    );
    expect(out).toContain('Authorization = "Bearer tok-1"');
  });

  it('preserves comments and ordering of unrelated tables', () => {
    const existing = [
      '# top-level user comment',
      'log_level = "info"',
      '',
      '[[mcp_servers]]',
      '# another teammate added this',
      'name = "other"',
      'transport = "http"',
      'url = "https://other.example.com/mcp"',
      '',
      '[other_table]',
      'foo = "bar"',
      '',
    ].join('\n');
    const out = applyMcpEntryToml(existing, entry, { roomCode: ROOM });
    expect(out).toContain('# top-level user comment');
    expect(out).toContain('log_level = "info"');
    expect(out).toContain('# another teammate added this');
    expect(out).toContain('name = "other"');
    expect(out).toContain('[other_table]');
    expect(out).toContain('foo = "bar"');
    expect(out).toContain('name = "knowork"');
  });

  it('replaces an existing knowork block in place rather than duplicating', () => {
    const stale = [
      '[[mcp_servers]]',
      'name = "knowork"',
      'transport = "http"',
      'url = "https://stale.example.com/mcp"',
      '[mcp_servers.headers]',
      'X-Room-Code = "OLDROOMCDE"',
      '',
    ].join('\n');
    const out = applyMcpEntryToml(stale, entry, { roomCode: ROOM });
    expect(out).toContain('https://knowork.app/mcp');
    expect(out).not.toContain('https://stale.example.com/mcp');
    expect(out).not.toContain('OLDROOMCDE');
    const matches = out.match(/name = "knowork"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('is idempotent — apply twice equals apply once', () => {
    const once = applyMcpEntryToml(null, entry, { roomCode: ROOM });
    const twice = applyMcpEntryToml(once, entry, { roomCode: ROOM });
    expect(twice).toBe(once);
  });

  it('idempotent against a file with surrounding content', () => {
    const existing =
      '# header comment\n\n[[mcp_servers]]\nname = "other"\ntransport = "http"\nurl = "https://o/mcp"\n';
    const once = applyMcpEntryToml(existing, entry, { roomCode: ROOM });
    const twice = applyMcpEntryToml(once, entry, { roomCode: ROOM });
    expect(twice).toBe(once);
  });

  it('preserves user-added headers on the knowork entry across re-runs', () => {
    const existing = [
      '[[mcp_servers]]',
      'name = "knowork"',
      'transport = "http"',
      'url = "https://knowork.app/mcp"',
      '[mcp_servers.headers]',
      `X-Room-Code = "${ROOM}"`,
      'X-Custom-Proxy = "secret"',
      '',
    ].join('\n');
    const out = applyMcpEntryToml(existing, entry, { roomCode: ROOM });
    expect(out).toContain('X-Custom-Proxy = "secret"');
    expect(out).toContain(`X-Room-Code = "${ROOM}"`);
  });

  it('knowork-managed headers always win over user-added ones with the same key', () => {
    const existing = [
      '[[mcp_servers]]',
      'name = "knowork"',
      'transport = "http"',
      'url = "https://knowork.app/mcp"',
      '[mcp_servers.headers]',
      'X-Room-Code = "STALEROOM1"',
      'Authorization = "Bearer old"',
      '',
    ].join('\n');
    const out = applyMcpEntryToml(existing, { ...entry, token: 'new' }, { roomCode: ROOM });
    expect(out).toContain(`X-Room-Code = "${ROOM}"`);
    expect(out).toContain('Authorization = "Bearer new"');
    expect(out).not.toContain('STALEROOM1');
    expect(out).not.toContain('Bearer old');
  });

  it('does not mutate other [[mcp_servers]] entries', () => {
    const existing = [
      '[[mcp_servers]]',
      'name = "other"',
      'transport = "http"',
      'url = "https://other.example.com/mcp"',
      '[mcp_servers.headers]',
      'X-Foo = "bar"',
      '',
    ].join('\n');
    const out = applyMcpEntryToml(existing, entry, { roomCode: ROOM });
    expect(out).toContain('name = "other"');
    expect(out).toContain('https://other.example.com/mcp');
    expect(out).toContain('X-Foo = "bar"');
    expect(out).toContain('name = "knowork"');
  });
});

describe('removeMcpEntryToml', () => {
  it('is a no-op when no knowork entry exists', () => {
    const existing = '[[mcp_servers]]\nname = "other"\nurl = "https://o"\n';
    expect(removeMcpEntryToml(existing)).toBe(existing);
  });

  it('removes only the knowork block, keeping unrelated blocks and comments', () => {
    const existing = [
      '# preserved header',
      'log_level = "info"',
      '',
      '[[mcp_servers]]',
      'name = "other"',
      'transport = "http"',
      'url = "https://o/mcp"',
      '',
    ].join('\n');
    const applied = applyMcpEntryToml(existing, entry, { roomCode: ROOM });
    const removed = removeMcpEntryToml(applied);
    expect(removed).toContain('# preserved header');
    expect(removed).toContain('log_level = "info"');
    expect(removed).toContain('name = "other"');
    expect(removed).not.toContain('name = "knowork"');
  });

  it('round-trip: nearly equal to original (trailing whitespace normalization OK)', () => {
    const original = [
      '# top comment',
      'log_level = "info"',
      '',
      '[[mcp_servers]]',
      'name = "other"',
      'transport = "http"',
      'url = "https://o/mcp"',
      '',
    ].join('\n');
    const applied = applyMcpEntryToml(original, entry, { roomCode: ROOM });
    const removed = removeMcpEntryToml(applied);
    expect(removed.replace(/\s+$/g, '')).toBe(original.replace(/\s+$/g, ''));
  });

  it('returns empty string when removing the only block in the file', () => {
    const applied = applyMcpEntryToml(null, entry, { roomCode: ROOM });
    expect(removeMcpEntryToml(applied)).toBe('');
  });

  it('handles empty input as a no-op', () => {
    expect(removeMcpEntryToml('')).toBe('');
  });
});
