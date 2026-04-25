import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const cliBin = resolve(here, '../dist/cli.js');

const PACKAGE_VERSION = '0.1.0';

describe('knowork CLI smoke test', () => {
  it('--version emits the package version', () => {
    const result = spawnSync(process.execPath, [cliBin, '--version'], { encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(PACKAGE_VERSION);
  });

  it('--help lists `connect` and `disconnect` commands', () => {
    const result = spawnSync(process.execPath, [cliBin, '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/connect/);
    expect(result.stdout).toMatch(/disconnect/);
  });
});
