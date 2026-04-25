# knowork

One-command Knowork onboarding for AI coding agents.

```bash
npx knowork connect <ROOM-CODE>
```

That writes the right MCP entry to your agent's config and adds the Knowork protocol paragraph to `CLAUDE.md` / `AGENTS.md` so your agent actually calls the tools. Restart your agent and you're in the room.

## Supported agents

- **Claude Code** — `~/.claude/.mcp.json` (global) or `./.mcp.json` (project)
- **Codex CLI** — `~/.codex/config.toml`
- **Cursor** — `~/.cursor/mcp.json` (global) or `./.cursor/mcp.json` (project)
- **Manual** — prints the snippet for any other agent

The CLI auto-detects which agent invoked it. Override with `--agent <name>`.

## Common flags

```
knowork connect <CODE> [flags]

  --server <url>            Knowork server URL (default: $KNOWORK_SERVER or https://knowork.app)
  --agent <name>            Force adapter (claude-code | codex-cli | cursor | manual)
  --password <pw>           Exchange password for a room token, embedded as a Bearer header
  --project / --global      Override scope (default: project inside a git repo, else global)
  --allow-token-in-repo     Permit writing the room token into a git-tracked file
  --no-rules-file           Skip the CLAUDE.md / AGENTS.md update
  --dry-run                 Print planned diffs without writing anything
  --yes                     Skip the interactive confirmation
```

```
knowork disconnect [flags]
```

`disconnect` removes only what `connect` added (the `knowork` MCP entry and the marker-bounded rules-file region).

## What gets written

- An entry under `mcpServers.knowork` (or the equivalent for your agent's format) pointing at the server URL with `X-Room-Code: <CODE>`.
- A block in `CLAUDE.md` / `AGENTS.md` between `<!-- knowork:start -->` and `<!-- knowork:end -->` markers. The CLI never touches text outside those markers.

Re-running `connect` is idempotent. Running with a different room code updates in place.

## License

[MIT](../../LICENSE)
