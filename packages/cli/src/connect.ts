import { consola } from 'consola';
import { CliError } from './errors.js';
import { normalizeRoomCode } from './room-code.js';
import { detectAdapter } from './detect.js';
import { confirmDetection } from './confirm.js';
import { resolveScope, gitRepoRoot } from './scope.js';
import { ServerClient } from './server-client.js';
import { applyPlannedWrites, isPathInsideGitTree, readIfExists } from './file-batch.js';
import { applyRulesBlock } from './rules-file.js';
import { renderPlannedWrites } from './diff.js';
import { knoworkRulesBlock } from './protocol-text.js';
import type { ConnectOptions, McpEntry, PlannedWrite, ResolvedScope } from './types.js';
import type { AgentAdapter } from './adapters/types.js';

// Files that hold the marker-bounded rules block, in order. We always keep
// CLAUDE.md and AGENTS.md in sync so an agent that reads either one (or both)
// sees the protocol guidance — the project itself follows the same convention.
const RULES_FILES = ['CLAUDE.md', 'AGENTS.md'];

function defaultServerUrl(): string {
  return process.env.KNOWORK_SERVER ?? 'https://knowork.app';
}

export async function connect(opts: ConnectOptions): Promise<void> {
  const roomCode = normalizeRoomCode(opts.roomCode);
  const serverUrl = opts.server ?? defaultServerUrl();

  // Detection + confirmation. Forced --agent short-circuits this.
  const detection = await detectAdapter({ forcedAgentId: opts.agent });
  const { adapter, confirmed } = await confirmDetection(detection, {
    assumeYes: opts.assumeYes,
  });
  if (!confirmed) throw new CliError('cancelled by user');

  const scope = resolveScope(opts.scope, adapter.supportsProjectScope);

  // Server existence check happens BEFORE any file writes so a typo'd room
  // code never mutates the user's config.
  const client = new ServerClient(serverUrl);
  const room = await client.fetchRoom(roomCode);
  if (!room) {
    throw new CliError(`Room ${roomCode} not found on ${serverUrl}.`, {
      remediation: 'Double-check the code, or `--server <url>` if you are self-hosting.',
    });
  }

  let token: string | undefined;
  if (opts.password !== undefined) {
    token = await client.exchangePassword(roomCode, opts.password);
  }

  const entry: McpEntry = {
    url: mcpEndpoint(serverUrl),
    token,
    headers: { 'X-Room-Code': roomCode },
  };

  const plans = computeConnectPlans({
    adapter,
    scope,
    entry,
    roomCode,
    writeRulesFile: opts.writeRulesFile,
    allowTokenInRepo: opts.allowTokenInRepo,
  });

  if (opts.dryRun) {
    process.stdout.write(renderPlannedWrites(plans));
    return;
  }

  const writablePlans = plans.filter((p) => !p.path.startsWith('<'));
  const changedWritablePlans = writablePlans.filter((p) => p.before !== p.after);
  const manualSnippet = plans.find((p) => p.path.startsWith('<') && p.after !== null);

  if (changedWritablePlans.length === 0 && !manualSnippet) {
    consola.info('Already connected — nothing to write.');
    return;
  }

  applyPlannedWrites(writablePlans);
  printConnectSummary(plans, adapter, roomCode, scope);
}

interface ConnectPlanInput {
  adapter: AgentAdapter;
  scope: ResolvedScope;
  entry: McpEntry;
  roomCode: string;
  writeRulesFile: boolean;
  allowTokenInRepo: boolean;
}

export function computeConnectPlans(input: ConnectPlanInput): PlannedWrite[] {
  const { adapter, scope, entry, roomCode, writeRulesFile, allowTokenInRepo } = input;
  const plans: PlannedWrite[] = [];

  // The `manual` adapter doesn't write to an MCP config — its applyMcpEntry
  // returns a snippet for the human to paste. We surface it via a synthetic
  // PlannedWrite whose path is the sentinel string so the diff renderer
  // shows the snippet under a clearly fake-looking header.
  if (adapter.id === 'manual') {
    const snippet = adapter.applyMcpEntry(null, entry, { roomCode });
    plans.push({
      path: '<paste this into your agent\'s MCP config>',
      before: null,
      after: snippet,
      reason: 'manual snippet (not written to disk)',
    });
  } else {
    const configPath = adapter.configPath(scope);
    // Only block when the file actually lives inside a git tree. The user
    // may have a `--project` write target that they manage outside git
    // (rare, but legal); in that case the token concern doesn't apply.
    if (
      entry.token !== undefined &&
      scope === 'project' &&
      !allowTokenInRepo &&
      isPathInsideGitTree(configPath)
    ) {
      throw new CliError(
        `Refusing to write the room token into a tracked-tree file: ${configPath}`,
        {
          remediation:
            'Re-run with `--global` (write to user-scope) or `--allow-token-in-repo` to override.',
        },
      );
    }
    const before = readIfExists(configPath);
    const after = adapter.applyMcpEntry(before, entry, { roomCode });
    plans.push({
      path: configPath,
      before,
      after,
      reason: 'knowork MCP entry',
    });
  }

  // Global scope has no obvious rules-file location — we skip and surface
  // that fact in the summary.
  const rulesRoot = scope === 'project' ? gitRepoRoot() ?? process.cwd() : null;
  if (writeRulesFile && rulesRoot !== null) {
    const block = knoworkRulesBlock();
    for (const name of RULES_FILES) {
      const path = `${rulesRoot}/${name}`;
      const before = readIfExists(path);
      const after = applyRulesBlock(before, block);
      plans.push({ path, before, after, reason: `rules: ${name}` });
    }
  }

  return plans;
}

function mcpEndpoint(serverUrl: string): string {
  // Accept either the bare host or a path that already ends in /mcp; we
  // normalize to /mcp so the user can paste either.
  const trimmed = serverUrl.replace(/\/+$/, '');
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`;
}

function printConnectSummary(
  plans: PlannedWrite[],
  adapter: AgentAdapter,
  roomCode: string,
  scope: ResolvedScope,
): void {
  const written = plans.filter((p) => p.before !== p.after);
  consola.success(
    `Connected to room ${roomCode} via ${adapter.displayName} (${scope} scope).`,
  );
  for (const w of written) {
    if (w.path.startsWith('<')) {
      consola.box(w.after ?? '');
      consola.info('Paste the block above into your agent\'s MCP config.');
    } else {
      consola.info(`  ${w.before === null ? 'created' : 'updated'} ${w.path}`);
    }
  }
  consola.info('Restart your agent to pick up the new MCP server.');
}
