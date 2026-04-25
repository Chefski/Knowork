import { describe, expect, it } from 'vitest';
import { applyMcpEntryJson, removeMcpEntryJson } from './json-config.js';
import type { McpEntry } from './types.js';

const entry: McpEntry = {
  url: 'https://knowork.app/mcp',
  headers: {},
};

const ROOM = 'ABCDEFGHIJ';

describe('applyMcpEntryJson', () => {
  it('creates a config from null with a single knowork entry', () => {
    const out = applyMcpEntryJson(null, entry, { roomCode: ROOM });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.knowork).toEqual({
      type: 'http',
      url: 'https://knowork.app/mcp',
      headers: { 'X-Room-Code': ROOM },
    });
    expect(out.endsWith('\n')).toBe(true);
  });

  it('treats empty input as null', () => {
    const out = applyMcpEntryJson('', entry, { roomCode: ROOM });
    expect(JSON.parse(out).mcpServers.knowork.url).toBe('https://knowork.app/mcp');
  });

  it('embeds Authorization header when token is present', () => {
    const out = applyMcpEntryJson(
      null,
      { ...entry, token: 'abc123' },
      { roomCode: ROOM },
    );
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.knowork.headers.Authorization).toBe('Bearer abc123');
    expect(parsed.mcpServers.knowork.headers['X-Room-Code']).toBe(ROOM);
  });

  it("does not touch unrelated mcpServers entries", () => {
    const existing = JSON.stringify(
      {
        mcpServers: {
          'other-server': {
            type: 'http',
            url: 'https://other.example.com/mcp',
            headers: { 'X-Foo': 'bar' },
          },
        },
      },
      null,
      2,
    ) + '\n';
    const out = applyMcpEntryJson(existing, entry, { roomCode: ROOM });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers['other-server']).toEqual({
      type: 'http',
      url: 'https://other.example.com/mcp',
      headers: { 'X-Foo': 'bar' },
    });
    expect(parsed.mcpServers.knowork.url).toBe('https://knowork.app/mcp');
  });

  it('preserves unrelated top-level keys', () => {
    const existing = JSON.stringify({ otherTopLevel: { a: 1 }, mcpServers: {} }, null, 2) + '\n';
    const out = applyMcpEntryJson(existing, entry, { roomCode: ROOM });
    const parsed = JSON.parse(out);
    expect(parsed.otherTopLevel).toEqual({ a: 1 });
  });

  it('is idempotent — apply twice byte-identical to apply once', () => {
    const once = applyMcpEntryJson(null, entry, { roomCode: ROOM });
    const twice = applyMcpEntryJson(once, entry, { roomCode: ROOM });
    expect(twice).toBe(once);
  });

  it('preserves user-added headers on the knowork entry across re-runs', () => {
    // User manually added a custom header to the knowork entry (e.g. corp proxy auth).
    const existing =
      JSON.stringify(
        {
          mcpServers: {
            knowork: {
              type: 'http',
              url: 'https://knowork.app/mcp',
              headers: { 'X-Room-Code': ROOM, 'X-Custom-Proxy': 'secret' },
            },
          },
        },
        null,
        2,
      ) + '\n';
    const out = applyMcpEntryJson(existing, entry, { roomCode: ROOM });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.knowork.headers['X-Custom-Proxy']).toBe('secret');
    expect(parsed.mcpServers.knowork.headers['X-Room-Code']).toBe(ROOM);
  });

  it('knowork-managed headers always win over user-added ones with the same key', () => {
    // If a user typo'd X-Room-Code with a stale value, connect must overwrite it.
    const existing =
      JSON.stringify(
        {
          mcpServers: {
            knowork: {
              type: 'http',
              url: 'https://knowork.app/mcp',
              headers: { 'X-Room-Code': 'STALE_ROOM', Authorization: 'Bearer old' },
            },
          },
        },
        null,
        2,
      ) + '\n';
    const out = applyMcpEntryJson(existing, { ...entry, token: 'new' }, { roomCode: ROOM });
    const parsed = JSON.parse(out);
    expect(parsed.mcpServers.knowork.headers['X-Room-Code']).toBe(ROOM);
    expect(parsed.mcpServers.knowork.headers.Authorization).toBe('Bearer new');
  });

  it('updates in place when run with a different room code', () => {
    const first = applyMcpEntryJson(null, entry, { roomCode: 'AAAAAAAAAA' });
    const second = applyMcpEntryJson(first, entry, { roomCode: 'BBBBBBBBBB' });
    const parsed = JSON.parse(second);
    expect(parsed.mcpServers.knowork.headers['X-Room-Code']).toBe('BBBBBBBBBB');
    // Only one knowork entry, no duplicates.
    expect(Object.keys(parsed.mcpServers).filter((k) => k === 'knowork')).toHaveLength(1);
  });
});

describe('removeMcpEntryJson', () => {
  it('round-trip: apply then remove on null returns config without knowork', () => {
    const applied = applyMcpEntryJson(null, entry, { roomCode: ROOM });
    const removed = removeMcpEntryJson(applied);
    const parsed = JSON.parse(removed);
    expect(parsed.mcpServers).toEqual({});
  });

  it('byte-identical round-trip when other entries existed', () => {
    const original = JSON.stringify(
      {
        mcpServers: {
          'other-server': {
            type: 'http',
            url: 'https://other.example.com/mcp',
            headers: { 'X-Foo': 'bar' },
          },
        },
      },
      null,
      2,
    ) + '\n';
    const applied = applyMcpEntryJson(original, entry, { roomCode: ROOM });
    const removed = removeMcpEntryJson(applied);
    expect(removed).toBe(original);
  });

  it('is a no-op when knowork entry is absent', () => {
    const config = JSON.stringify(
      { mcpServers: { 'other-server': { type: 'http', url: 'https://x', headers: {} } } },
      null,
      2,
    ) + '\n';
    const out = removeMcpEntryJson(config);
    expect(out).toBe(config);
  });
});
