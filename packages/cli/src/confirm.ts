import { createInterface } from 'node:readline';
import type { AgentAdapter } from './adapters/types.js';
import { CliError } from './errors.js';
import type { DetectionOutcome } from './detect.js';

export interface ConfirmOptions {
  assumeYes: boolean;
  // Whether stdin is a TTY. Defaults to `process.stdin.isTTY === true` when
  // omitted; tests inject this explicitly so they don't depend on the runner.
  isTty?: boolean;
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

export interface ConfirmResult {
  adapter: AgentAdapter;
  confirmed: boolean;
}

const AMBIGUOUS_MAX_ATTEMPTS = 3;

export async function confirmDetection(
  outcome: DetectionOutcome,
  opts: ConfirmOptions,
): Promise<ConfirmResult> {
  const isTty = opts.isTty ?? process.stdin.isTTY === true;
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;

  switch (outcome.kind) {
    case 'forced':
      // Forced selection is an explicit user decision; don't second-guess it.
      return { adapter: outcome.adapter, confirmed: true };

    case 'single': {
      // Spec: interactive confirmation only when stdin is a TTY. In non-TTY
      // contexts we proceed silently — refusing here would break scripted
      // single-detection use, and the spec only requires refusal for
      // ambiguous/none.
      if (opts.assumeYes || !isTty) return { adapter: outcome.adapter, confirmed: true };
      const reader = createLineReader(stdin);
      stdout.write(`Detected: ${outcome.adapter.displayName}. Continue? [Y/n] `);
      const normalised = (await reader()).trim().toLowerCase();
      const yes = normalised === '' || normalised === 'y' || normalised === 'yes';
      return { adapter: outcome.adapter, confirmed: yes };
    }

    case 'ambiguous': {
      if (!isTty) {
        const ids = outcome.candidates.map((c) => c.adapter.id).join(', ');
        throw new CliError(`Ambiguous agent detection: ${ids}`, {
          remediation: 'pass `--agent <name>` to disambiguate',
        });
      }
      return pickAmbiguous(outcome.candidates, stdin, stdout);
    }

    case 'none':
      throw new CliError('could not detect a coding agent; pass --agent <name>');
  }
}

async function pickAmbiguous(
  candidates: { adapter: AgentAdapter; signals: string[] }[],
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
): Promise<ConfirmResult> {
  const list = candidates
    .map((c, i) => {
      const signals = c.signals.length > 0 ? ` — ${c.signals.join(', ')}` : '';
      return `${i + 1}. ${c.adapter.displayName}${signals}`;
    })
    .join('\n');
  stdout.write(list + '\n');

  const reader = createLineReader(stdin);
  for (let attempt = 0; attempt < AMBIGUOUS_MAX_ATTEMPTS; attempt += 1) {
    stdout.write(`Pick one [1-${candidates.length}] (or q to abort): `);
    // eslint-disable-next-line no-await-in-loop -- interactive prompt is inherently sequential
    const trimmed = (await reader()).trim();
    const lower = trimmed.toLowerCase();
    if (trimmed === '' || lower === 'q' || lower === 'quit') {
      throw new CliError('aborted by user');
    }
    const n = Number(trimmed);
    if (Number.isInteger(n) && n >= 1 && n <= candidates.length) {
      return { adapter: candidates[n - 1]!.adapter, confirmed: true };
    }
    // Fall through to next attempt; we deliberately do not echo a hint here
    // because the prompt itself names the valid range.
  }
  throw new CliError('aborted by user');
}

// Build a line reader that buffers parsed lines from a single readline pass.
// We can't reuse `rl.question()` for re-prompts here because once the source
// stream ends readline closes and any further `question()` call throws. By
// driving readline ourselves and queueing lines, late readers receive an
// empty string after end-of-stream rather than crashing — matching how a
// user pressing Enter on an empty prompt is handled elsewhere.
function createLineReader(stdin: NodeJS.ReadableStream): () => Promise<string> {
  const rl = createInterface({ input: stdin, terminal: false });
  const lines: string[] = [];
  const waiters: ((line: string) => void)[] = [];
  let closed = false;
  rl.on('line', (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()!('');
  });
  return () =>
    new Promise<string>((resolve) => {
      if (lines.length > 0) {
        resolve(lines.shift()!);
        return;
      }
      if (closed) {
        resolve('');
        return;
      }
      waiters.push(resolve);
    });
}
