import { consola } from 'consola';
import { detectAdapter } from './detect.js';
import { confirmDetection } from './confirm.js';
import { resolveScope, gitRepoRoot } from './scope.js';
import { applyPlannedWrites, readIfExists } from './file-batch.js';
import { removeRulesBlock } from './rules-file.js';
import { renderPlannedWrites } from './diff.js';
import { CliError } from './errors.js';
import type { DisconnectOptions, PlannedWrite, ResolvedScope } from './types.js';
import type { AgentAdapter } from './adapters/types.js';

const RULES_FILES = ['CLAUDE.md', 'AGENTS.md'];

export async function disconnect(opts: DisconnectOptions): Promise<void> {
  const detection = await detectAdapter({ forcedAgentId: opts.agent });
  // "Remove what isn't there" is logically a no-op — exit cleanly rather than
  // erroring. Connect rightly refuses 'none' (you can't connect what you can't
  // detect), but disconnect should be idempotent against an already-clean host.
  if (detection.kind === 'none') {
    consola.info('Nothing to remove — no coding agent detected here.');
    return;
  }
  const { adapter, confirmed } = await confirmDetection(detection, {
    assumeYes: opts.assumeYes,
  });
  if (!confirmed) throw new CliError('cancelled by user');

  const scope = resolveScope(opts.scope, adapter.supportsProjectScope);
  const plans = computeDisconnectPlans({
    adapter,
    scope,
    writeRulesFile: opts.writeRulesFile,
  });

  if (plans.every((p) => p.before === p.after)) {
    // Nothing on disk references knowork. Spec calls this a no-op exiting zero.
    consola.info('Nothing to remove — knowork is not configured for this agent here.');
    return;
  }

  if (opts.dryRun) {
    process.stdout.write(renderPlannedWrites(plans));
    return;
  }

  applyPlannedWrites(plans);
  consola.success(`Disconnected from ${adapter.displayName} (${scope} scope).`);
  for (const p of plans.filter((x) => x.before !== x.after)) {
    consola.info(`  cleaned ${p.path}`);
  }
}

interface DisconnectPlanInput {
  adapter: AgentAdapter;
  scope: ResolvedScope;
  writeRulesFile: boolean;
}

export function computeDisconnectPlans(input: DisconnectPlanInput): PlannedWrite[] {
  const { adapter, scope, writeRulesFile } = input;
  const plans: PlannedWrite[] = [];

  if (adapter.id !== 'manual') {
    const configPath = adapter.configPath(scope);
    const before = readIfExists(configPath);
    if (before !== null) {
      const after = adapter.removeMcpEntry(before);
      plans.push({ path: configPath, before, after, reason: 'remove MCP entry' });
    }
  }

  if (writeRulesFile) {
    const rulesRoot = scope === 'project' ? gitRepoRoot() ?? process.cwd() : null;
    if (rulesRoot !== null) {
      for (const name of RULES_FILES) {
        const path = `${rulesRoot}/${name}`;
        const before = readIfExists(path);
        if (before !== null) {
          const after = removeRulesBlock(before);
          plans.push({ path, before, after, reason: `remove rules: ${name}` });
        }
      }
    }
  }

  return plans;
}
