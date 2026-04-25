import { describe, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import type { AgentAdapter, DetectionResult } from './adapters/types.js';
import type { DetectionOutcome } from './detect.js';
import { confirmDetection } from './confirm.js';

function fakeAdapter(id: string, displayName = id): AgentAdapter {
  const detection: DetectionResult = { present: false, signals: [] };
  return {
    id,
    displayName,
    detect: async () => detection,
    supportsProjectScope: true,
    configPath: () => '/fake',
    applyMcpEntry: () => '',
    removeMcpEntry: () => '',
  };
}

class FakeWritable extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    cb();
  }
  get text(): string {
    return this.chunks.join('');
  }
}

function lineStream(...lines: string[]): Readable {
  // Each line gets a trailing newline so readline emits it as a complete line.
  // Joining first then constructing Readable.from with one element preserves
  // ordering even when readline splits internally.
  return Readable.from([lines.map((l) => l + '\n').join('')]);
}

describe('confirmDetection', () => {
  it('returns confirmed=true for forced outcome without prompting', async () => {
    const adapter = fakeAdapter('claude-code', 'Claude Code');
    const outcome: DetectionOutcome = { kind: 'forced', adapter };
    const stdout = new FakeWritable();
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: Readable.from([]),
      stdout,
    });
    expect(result).toEqual({ adapter, confirmed: true });
    expect(stdout.text).toBe('');
  });

  it('skips prompt when assumeYes=true on a single outcome', async () => {
    const adapter = fakeAdapter('claude-code');
    const outcome: DetectionOutcome = { kind: 'single', adapter, signals: [] };
    const stdout = new FakeWritable();
    const result = await confirmDetection(outcome, {
      assumeYes: true,
      isTty: true,
      stdin: Readable.from([]),
      stdout,
    });
    expect(result).toEqual({ adapter, confirmed: true });
    expect(stdout.text).toBe('');
  });

  it('returns confirmed=true for single outcome in non-TTY context', async () => {
    const adapter = fakeAdapter('claude-code');
    const outcome: DetectionOutcome = { kind: 'single', adapter, signals: [] };
    const stdout = new FakeWritable();
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: false,
      stdin: Readable.from([]),
      stdout,
    });
    expect(result).toEqual({ adapter, confirmed: true });
    expect(stdout.text).toBe('');
  });

  it('throws CliError for ambiguous outcome in non-TTY context', async () => {
    const a = fakeAdapter('claude-code');
    const b = fakeAdapter('cursor');
    const outcome: DetectionOutcome = {
      kind: 'ambiguous',
      candidates: [
        { adapter: a, signals: ['x'] },
        { adapter: b, signals: ['y'] },
      ],
    };
    await expect(
      confirmDetection(outcome, {
        assumeYes: false,
        isTty: false,
        stdin: Readable.from([]),
        stdout: new FakeWritable(),
      }),
    ).rejects.toMatchObject({
      name: 'CliError',
      message: expect.stringContaining('claude-code'),
      remediation: expect.stringContaining('--agent'),
    });
  });

  it('throws CliError for none outcome in TTY context', async () => {
    await expect(
      confirmDetection(
        { kind: 'none' },
        {
          assumeYes: false,
          isTty: true,
          stdin: Readable.from([]),
          stdout: new FakeWritable(),
        },
      ),
    ).rejects.toMatchObject({
      name: 'CliError',
      message: expect.stringContaining('could not detect'),
    });
  });

  it('throws CliError for none outcome in non-TTY context', async () => {
    await expect(
      confirmDetection(
        { kind: 'none' },
        {
          assumeYes: false,
          isTty: false,
          stdin: Readable.from([]),
          stdout: new FakeWritable(),
        },
      ),
    ).rejects.toMatchObject({ name: 'CliError' });
  });

  it('TTY single + Y/Enter accepts', async () => {
    const adapter = fakeAdapter('claude-code', 'Claude Code');
    const outcome: DetectionOutcome = { kind: 'single', adapter, signals: [] };
    const stdout = new FakeWritable();
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: lineStream(''),
      stdout,
    });
    expect(result).toEqual({ adapter, confirmed: true });
    expect(stdout.text).toContain('Detected: Claude Code');
    expect(stdout.text).toContain('Continue? [Y/n]');
  });

  it("TTY single + 'y' accepts", async () => {
    const adapter = fakeAdapter('claude-code');
    const outcome: DetectionOutcome = { kind: 'single', adapter, signals: [] };
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: lineStream('y'),
      stdout: new FakeWritable(),
    });
    expect(result.confirmed).toBe(true);
  });

  it("TTY single + 'n' rejects", async () => {
    const adapter = fakeAdapter('claude-code');
    const outcome: DetectionOutcome = { kind: 'single', adapter, signals: [] };
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: lineStream('n'),
      stdout: new FakeWritable(),
    });
    expect(result).toEqual({ adapter, confirmed: false });
  });

  it('ambiguous TTY numeric picker selects the matching adapter', async () => {
    const a = fakeAdapter('claude-code', 'Claude Code');
    const b = fakeAdapter('cursor', 'Cursor');
    const outcome: DetectionOutcome = {
      kind: 'ambiguous',
      candidates: [
        { adapter: a, signals: ['CLAUDECODE=1'] },
        { adapter: b, signals: ['TERM_PROGRAM=Cursor'] },
      ],
    };
    const stdout = new FakeWritable();
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: lineStream('2'),
      stdout,
    });
    expect(result).toEqual({ adapter: b, confirmed: true });
    expect(stdout.text).toContain('1. Claude Code');
    expect(stdout.text).toContain('CLAUDECODE=1');
    expect(stdout.text).toContain('2. Cursor');
    expect(stdout.text).toContain('TERM_PROGRAM=Cursor');
    expect(stdout.text).toContain('Pick one [1-2]');
  });

  it("ambiguous 'q' aborts with CliError", async () => {
    const a = fakeAdapter('claude-code');
    const b = fakeAdapter('cursor');
    const outcome: DetectionOutcome = {
      kind: 'ambiguous',
      candidates: [
        { adapter: a, signals: [] },
        { adapter: b, signals: [] },
      ],
    };
    await expect(
      confirmDetection(outcome, {
        assumeYes: false,
        isTty: true,
        stdin: lineStream('q'),
        stdout: new FakeWritable(),
      }),
    ).rejects.toMatchObject({ name: 'CliError', message: expect.stringContaining('aborted') });
  });

  it('ambiguous invalid input re-prompts and eventually throws after 3 attempts', async () => {
    const a = fakeAdapter('claude-code');
    const b = fakeAdapter('cursor');
    const outcome: DetectionOutcome = {
      kind: 'ambiguous',
      candidates: [
        { adapter: a, signals: [] },
        { adapter: b, signals: [] },
      ],
    };
    const stdout = new FakeWritable();
    await expect(
      confirmDetection(outcome, {
        assumeYes: false,
        isTty: true,
        // Three invalid inputs in a row exhausts the retry budget.
        stdin: lineStream('99', 'foo', '0'),
        stdout,
      }),
    ).rejects.toMatchObject({ name: 'CliError', message: expect.stringContaining('aborted') });
    // Re-prompt shown at least twice (attempts 2 and 3 after the initial one).
    const promptMatches = stdout.text.match(/Pick one \[1-2\]/g) ?? [];
    expect(promptMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('ambiguous re-prompts on invalid then accepts a valid number', async () => {
    const a = fakeAdapter('claude-code', 'Claude Code');
    const b = fakeAdapter('cursor', 'Cursor');
    const outcome: DetectionOutcome = {
      kind: 'ambiguous',
      candidates: [
        { adapter: a, signals: [] },
        { adapter: b, signals: [] },
      ],
    };
    const result = await confirmDetection(outcome, {
      assumeYes: false,
      isTty: true,
      stdin: lineStream('foo', '1'),
      stdout: new FakeWritable(),
    });
    expect(result).toEqual({ adapter: a, confirmed: true });
  });
});
