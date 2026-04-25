import { describe, expect, it } from 'vitest';
import type { AgentAdapter, DetectionResult } from './adapters/types.js';
import { detectAdapter } from './detect.js';

function fakeAdapter(
  id: string,
  detection: DetectionResult,
  displayName?: string,
): AgentAdapter {
  return {
    id,
    displayName: displayName ?? id,
    detect: async () => detection,
    supportsProjectScope: true,
    configPath: () => '/fake',
    applyMcpEntry: () => '',
    removeMcpEntry: () => '',
  };
}

describe('detectAdapter', () => {
  it('throws CliError for an unknown forced id and lists supported ids', async () => {
    const adapters = [
      fakeAdapter('claude-code', { present: false, signals: [] }),
      fakeAdapter('cursor', { present: false, signals: [] }),
    ];
    await expect(
      detectAdapter({ forcedAgentId: 'nope', adapters }),
    ).rejects.toMatchObject({
      name: 'CliError',
      message: expect.stringContaining('nope'),
      remediation: expect.stringContaining('claude-code'),
    });
  });

  it('returns kind=forced for a known forced id regardless of detect()', async () => {
    const adapters = [
      fakeAdapter('claude-code', { present: false, signals: [] }),
      fakeAdapter('cursor', { present: true, signals: ['TERM_PROGRAM=Cursor'] }),
    ];
    const outcome = await detectAdapter({ forcedAgentId: 'claude-code', adapters });
    expect(outcome.kind).toBe('forced');
    if (outcome.kind === 'forced') {
      expect(outcome.adapter.id).toBe('claude-code');
    }
  });

  it('returns kind=none when no adapter reports present', async () => {
    const adapters = [
      fakeAdapter('claude-code', { present: false, signals: [] }),
      fakeAdapter('cursor', { present: false, signals: [] }),
    ];
    const outcome = await detectAdapter({ adapters });
    expect(outcome).toEqual({ kind: 'none' });
  });

  it('returns kind=single with signals when exactly one adapter is present', async () => {
    const adapters = [
      fakeAdapter('claude-code', { present: true, signals: ['CLAUDECODE=1'] }),
      fakeAdapter('cursor', { present: false, signals: [] }),
    ];
    const outcome = await detectAdapter({ adapters });
    expect(outcome.kind).toBe('single');
    if (outcome.kind === 'single') {
      expect(outcome.adapter.id).toBe('claude-code');
      expect(outcome.signals).toEqual(['CLAUDECODE=1']);
    }
  });

  it('returns kind=ambiguous with all candidates when 2+ adapters are present', async () => {
    const adapters = [
      fakeAdapter('claude-code', { present: true, signals: ['CLAUDECODE=1'] }),
      fakeAdapter('cursor', { present: true, signals: ['TERM_PROGRAM=Cursor'] }),
      fakeAdapter('codex-cli', { present: false, signals: [] }),
    ];
    const outcome = await detectAdapter({ adapters });
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind === 'ambiguous') {
      expect(outcome.candidates.map((c) => c.adapter.id)).toEqual(['claude-code', 'cursor']);
      expect(outcome.candidates[0]!.signals).toEqual(['CLAUDECODE=1']);
      expect(outcome.candidates[1]!.signals).toEqual(['TERM_PROGRAM=Cursor']);
    }
  });
});
