import { claudeCodeAdapter } from './claude-code.js';
import { codexCliAdapter } from './codex-cli.js';
import { cursorAdapter } from './cursor.js';
import { geminiCliAdapter } from './gemini-cli.js';
import { manualAdapter } from './manual.js';
import { vscodeAdapter } from './vscode.js';
import { windsurfAdapter } from './windsurf.js';
import type { AgentAdapter } from './types.js';

// Order matters for detection iteration: claude-code first because it's the
// most common signal in this repo's audience.
export const ALL_ADAPTERS: AgentAdapter[] = [
  claudeCodeAdapter,
  codexCliAdapter,
  cursorAdapter,
  geminiCliAdapter,
  vscodeAdapter,
  windsurfAdapter,
  manualAdapter,
];

export function getAdapter(id: string): AgentAdapter | null {
  return ALL_ADAPTERS.find((a) => a.id === id) ?? null;
}

export type { AgentAdapter, DetectionResult } from './types.js';
export { MCP_ENTRY_KEY } from './types.js';
