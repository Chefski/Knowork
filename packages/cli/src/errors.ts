import { consola } from 'consola';

// CliError messages are designed to be printed verbatim to the user — they
// describe a recoverable misuse, not an internal bug. Treat any non-CliError
// exception as an unexpected crash.
export class CliError extends Error {
  readonly remediation?: string;
  readonly exitCode: number;
  constructor(message: string, opts: { remediation?: string; exitCode?: number } = {}) {
    super(message);
    this.name = 'CliError';
    this.remediation = opts.remediation;
    this.exitCode = opts.exitCode ?? 1;
  }
}

export function exitWithError(err: unknown): never {
  if (err instanceof CliError) {
    consola.error(err.message);
    if (err.remediation) consola.info(err.remediation);
    process.exit(err.exitCode);
  }
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  consola.error(`Unexpected error: ${message}`);
  process.exit(1);
}
