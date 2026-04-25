import { describe, expect, it } from 'vitest';
import { computeConnectPlans } from './connect.js';
import { computeDisconnectPlans } from './disconnect.js';
import { claudeCodeAdapter } from './adapters/claude-code.js';
import { manualAdapter } from './adapters/manual.js';
import type { McpEntry } from './types.js';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOM = 'ABCDFGHJKM';

function entry(token?: string): McpEntry {
  return {
    url: 'https://knowork.example/mcp',
    token,
    headers: { 'X-Room-Code': ROOM },
  };
}

describe('computeConnectPlans', () => {
  it('manual adapter produces a synthetic plan with the snippet, not a file write', () => {
    const plans = computeConnectPlans({
      adapter: manualAdapter,
      scope: 'global',
      entry: entry(),
      roomCode: ROOM,
      writeRulesFile: false,
      allowTokenInRepo: false,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.path.startsWith('<')).toBe(true);
    expect(plans[0]!.after).toContain(ROOM);
  });

  it('refuses to embed a token into a tracked-tree project file without override', () => {
    // Set up a temp repo with a `.git` so isPathInsideGitTree returns true.
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-connect-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        expect(() =>
          computeConnectPlans({
            adapter: claudeCodeAdapter,
            scope: 'project',
            entry: entry('sekrit-token'),
            roomCode: ROOM,
            writeRulesFile: false,
            allowTokenInRepo: false,
          }),
        ).toThrow(/Refusing to write the room token/);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allows the token through when --allow-token-in-repo is set', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-connect-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        const plans = computeConnectPlans({
          adapter: claudeCodeAdapter,
          scope: 'project',
          entry: entry('sekrit-token'),
          roomCode: ROOM,
          writeRulesFile: false,
          allowTokenInRepo: true,
        });
        expect(plans).toHaveLength(1);
        expect(plans[0]!.after).toContain('sekrit-token');
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('plans rules-file writes for both CLAUDE.md and AGENTS.md when writeRulesFile is true', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-connect-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        const plans = computeConnectPlans({
          adapter: claudeCodeAdapter,
          scope: 'project',
          entry: entry(),
          roomCode: ROOM,
          writeRulesFile: true,
          allowTokenInRepo: false,
        });
        const paths = plans.map((p) => p.path);
        expect(paths.some((p) => p.endsWith('CLAUDE.md'))).toBe(true);
        expect(paths.some((p) => p.endsWith('AGENTS.md'))).toBe(true);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('skips rules-file writes for global scope outside a repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-connect-noproject-'));
    try {
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        const plans = computeConnectPlans({
          adapter: claudeCodeAdapter,
          scope: 'global',
          entry: entry(),
          roomCode: ROOM,
          writeRulesFile: true,
          allowTokenInRepo: false,
        });
        const rulesPaths = plans.filter((p) => p.path.endsWith('.md'));
        expect(rulesPaths).toHaveLength(0);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('computeDisconnectPlans', () => {
  it('returns an empty plan when no files reference knowork', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-disc-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        const plans = computeDisconnectPlans({
          adapter: claudeCodeAdapter,
          scope: 'project',
          writeRulesFile: true,
        });
        // No `.mcp.json`, no `CLAUDE.md` — every read returns null, so plans
        // are empty (the disconnect command reports "nothing to remove").
        expect(plans.every((p) => p.before === p.after)).toBe(true);
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('plans removal for an existing managed entry', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'knowork-disc-real-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const cwd = process.cwd();
      process.chdir(tmp);
      try {
        // Seed a knowork-having .mcp.json then ensure removal plan touches it.
        writeFileSync(
          join(tmp, '.mcp.json'),
          JSON.stringify(
            {
              mcpServers: {
                knowork: {
                  type: 'http',
                  url: 'https://x/mcp',
                  headers: { 'X-Room-Code': ROOM },
                },
              },
            },
            null,
            2,
          ) + '\n',
        );
        const plans = computeDisconnectPlans({
          adapter: claudeCodeAdapter,
          scope: 'project',
          writeRulesFile: false,
        });
        const mcpPlan = plans.find((p) => p.path.endsWith('.mcp.json'));
        expect(mcpPlan).toBeDefined();
        expect(mcpPlan!.before).toContain('knowork');
        expect(mcpPlan!.after).not.toContain('knowork');
      } finally {
        process.chdir(cwd);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
