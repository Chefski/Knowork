import { CliError } from './errors.js';
import type { AgentAdapter } from './adapters/types.js';

// `signals` carries the human-readable evidence the adapter found (e.g. env
// vars set, config dirs present) so the confirmation prompt can show *why*
// each candidate matched, not just its name.
export type DetectionOutcome =
  | { kind: 'forced'; adapter: AgentAdapter }
  | { kind: 'single'; adapter: AgentAdapter; signals: string[] }
  | { kind: 'ambiguous'; candidates: { adapter: AgentAdapter; signals: string[] }[] }
  | { kind: 'none' };

export interface DetectInput {
  forcedAgentId?: string;
  // Tests inject a fake registry; production callers omit this so we lazily
  // resolve `ALL_ADAPTERS` from the adapters module.
  adapters?: AgentAdapter[];
}

// Lazy default-registry import: the adapters/index module is created by a
// parallel implementation track, so we defer the import to avoid a hard
// build-time dependency from this module on a sibling that may not exist yet.
async function defaultAdapters(): Promise<AgentAdapter[]> {
  const mod = await import('./adapters/index.js');
  return mod.ALL_ADAPTERS;
}

export async function detectAdapter(input: DetectInput = {}): Promise<DetectionOutcome> {
  const adapters = input.adapters ?? (await defaultAdapters());

  if (input.forcedAgentId !== undefined) {
    const forced = adapters.find((a) => a.id === input.forcedAgentId);
    if (!forced) {
      const known = adapters.map((a) => a.id).join(', ');
      throw new CliError(`Unknown agent id: ${input.forcedAgentId}`, {
        remediation: `Supported ids: ${known}`,
      });
    }
    return { kind: 'forced', adapter: forced };
  }

  // Run detection in parallel: detect() is I/O-bound (env reads, fs.stat) and
  // adapters are independent, so there is no reason to serialise.
  const results = await Promise.all(
    adapters.map(async (adapter) => ({ adapter, result: await adapter.detect() })),
  );
  const candidates = results
    .filter(({ result }) => result.present)
    .map(({ adapter, result }) => ({ adapter, signals: result.signals }));

  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) {
    const { adapter, signals } = candidates[0]!;
    return { kind: 'single', adapter, signals };
  }
  return { kind: 'ambiguous', candidates };
}
