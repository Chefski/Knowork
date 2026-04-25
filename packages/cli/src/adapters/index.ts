import { claudeCodeAdapter } from './claude-code.js';
import { codexCliAdapter } from './codex-cli.js';
import { cursorAdapter } from './cursor.js';
import { manualAdapter } from './manual.js';
import type { AgentAdapter } from './types.js';

// Order matters only insofar as detection iterates this list — claude-code is
// listed first because it's the most common signal in this repo's audience.
// Adding a new adapter is a one-line append plus a single adapter file; the
// contract test in `contract.test.ts` iterates this list so coverage is
// automatic.
export const ALL_ADAPTERS: AgentAdapter[] = [
  claudeCodeAdapter,
  codexCliAdapter,
  cursorAdapter,
  manualAdapter,
];

export function getAdapter(id: string): AgentAdapter | null {
  return ALL_ADAPTERS.find((a) => a.id === id) ?? null;
}

export type { AgentAdapter, DetectionResult } from './types.js';
export { MCP_ENTRY_KEY } from './types.js';
