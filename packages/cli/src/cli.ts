#!/usr/bin/env node
import { runCli } from './index.js';

runCli(process.argv).catch((err: unknown) => {
  // Last-resort handler. Commands should print human messages themselves and
  // throw a CliError; this catches unexpected exceptions.
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`knowork: ${message}\n`);
  process.exit(1);
});
