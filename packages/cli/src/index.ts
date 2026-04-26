import { Command } from 'commander';
import { connect } from './connect.js';
import { disconnect } from './disconnect.js';
import type { ScopeFlag } from './types.js';
import { CliError, exitWithError } from './errors.js';

const PACKAGE_VERSION = '0.1.0';

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('knowork')
    .description('Connect your coding agent to a Knowork room.')
    .version(PACKAGE_VERSION, '-v, --version');

  program
    .command('connect')
    .description('Wire the local coding agent to the given Knowork room.')
    .argument('<room-code>', 'The 10-character Knowork room code')
    .option(
      '--server <url>',
      'Knowork server URL (defaults to KNOWORK_SERVER env or https://knowork.app)',
    )
    .option(
      '--agent <name>',
      'Force the adapter (claude-code | codex-cli | cursor | gemini-cli | vscode | windsurf | manual). Skips auto-detection.',
    )
    .option('--password <pw>', 'Password for protected rooms (exchanged for a room token)')
    .option('--project', 'Force project-scope writes (./.mcp.json, ./CLAUDE.md, etc.)')
    .option('--global', 'Force user-scope writes (~/.claude/.mcp.json, etc.)')
    .option('--allow-token-in-repo', 'Permit writing the room token into a tracked file')
    .option('--no-rules-file', 'Skip writing the rules-file (CLAUDE.md / AGENTS.md) region')
    .option('--dry-run', 'Print planned diffs without writing any file', false)
    .option('--yes', 'Skip the interactive confirmation prompt', false)
    .action(async (roomCode: string, opts: ConnectCommandOptions) => {
      try {
        await connect({
          roomCode,
          server: opts.server,
          agent: opts.agent,
          password: opts.password,
          scope: resolveScope(opts),
          allowTokenInRepo: opts.allowTokenInRepo === true,
          writeRulesFile: opts.rulesFile !== false,
          dryRun: opts.dryRun === true,
          assumeYes: opts.yes === true,
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  program
    .command('disconnect')
    .description('Remove the Knowork MCP entry and managed rules-file region from this agent.')
    .option(
      '--agent <name>',
      'Force the adapter (claude-code | codex-cli | cursor | gemini-cli | vscode | windsurf | manual). Skips auto-detection.',
    )
    .option('--project', 'Force project-scope removal')
    .option('--global', 'Force user-scope removal')
    .option('--no-rules-file', 'Skip removing the rules-file region')
    .option('--dry-run', 'Print planned diffs without writing any file', false)
    .option('--yes', 'Skip the interactive confirmation prompt', false)
    .action(async (opts: DisconnectCommandOptions) => {
      try {
        await disconnect({
          agent: opts.agent,
          scope: resolveScope(opts),
          writeRulesFile: opts.rulesFile !== false,
          dryRun: opts.dryRun === true,
          assumeYes: opts.yes === true,
        });
      } catch (err) {
        exitWithError(err);
      }
    });

  await program.parseAsync(argv);
}

interface ScopeOpts {
  project?: boolean;
  global?: boolean;
}

interface ConnectCommandOptions extends ScopeOpts {
  server?: string;
  agent?: string;
  password?: string;
  allowTokenInRepo?: boolean;
  // Commander's `--no-rules-file` produces `rulesFile: false`
  rulesFile?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

interface DisconnectCommandOptions extends ScopeOpts {
  agent?: string;
  rulesFile?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

function resolveScope(opts: ScopeOpts): ScopeFlag {
  if (opts.project === true && opts.global === true) {
    throw new CliError('--project and --global are mutually exclusive');
  }
  if (opts.project === true) return 'project';
  if (opts.global === true) return 'global';
  return 'auto';
}
