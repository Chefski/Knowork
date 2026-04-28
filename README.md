# Knowork

<p align="center">
  <img src="./assets/knowork-project-image.png" alt="Knowork project image" width="640">
</p>

> **Slack status, but for AI coding agents.** Cross-agent, cross-developer, real-time presence and overlap-detection so your team's Claude Code, Codex, Cursor, Gemini CLI, VS Code, and Windsurf instances stop quietly duplicating each other's work.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## What it is

Teams using AI coding agents have no shared visibility into what those agents are currently doing across team members. When Patryk's Claude Code is refactoring `auth.ts`, Alice has no way to know — so she may ask Codex to do the same thing 30 minutes later, leading to duplicate work, merge conflicts, and wasted compute.

Knowork is a single self-hostable Node.js service that fixes that:

- An **MCP server** any coding agent (Claude Code, Codex, Cursor, etc.) can connect to
- An **agent-callable overlap check** so agents can self-coordinate before starting work
- A **live web board** showing who's working on what, in real time
- A **"recently shipped" log** so a teammate joining late can see what just finished
- **Heartbeat-based liveness** with explicit completion; entries vanish automatically when an agent dies

## Local development

```bash
git clone <repo>
cd knowork
pnpm install
pnpm dev
```

- Web UI: `http://localhost:5173`
- MCP endpoint: `http://localhost:8787/mcp`

Open the UI, click **Create new room**, copy the 10-character code.

## Connect your coding agent

```bash
npx knowork connect <ROOM-CODE>
```

This detects your agent (Claude Code / Codex CLI / Cursor / Gemini CLI / VS Code / Windsurf) and writes the right config. Then **restart your agent** to pick it up.

Self-hosted? Pass `--server <url>` (e.g. `npx knowork connect <ROOM-CODE> --server https://knowork.example.com`). To revert, run `npx knowork disconnect`.

Prefer to wire it manually? See [Manual setup](#manual-setup) below.

## Manual setup

**Claude Code** (`~/.claude/mcp.json` or per-project `.mcp.json`):

```json
{
  "mcpServers": {
    "knowork": {
      "transport": "http",
      "url": "http://localhost:8787/mcp",
      "headers": { "X-Room-Code": "YOUR-CODE" }
    }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`):

```toml
[[mcp_servers]]
name = "knowork"
transport = "http"
url = "http://localhost:8787/mcp"
```

**Cursor** (Settings → MCP → Add Server):

```json
{
  "name": "knowork",
  "transport": "http",
  "url": "http://localhost:8787/mcp"
}
```

**Gemini CLI** (`~/.gemini/settings.json` or per-project `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "knowork": {
      "httpUrl": "http://localhost:8787/mcp",
      "headers": { "X-Room-Code": "YOUR-CODE" }
    }
  }
}
```

**VS Code** (user-profile `mcp.json` or per-project `.vscode/mcp.json`):

```json
{
  "servers": {
    "knowork": {
      "type": "http",
      "url": "http://localhost:8787/mcp",
      "headers": { "X-Room-Code": "YOUR-CODE" }
    }
  }
}
```

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "knowork": {
      "serverUrl": "http://localhost:8787/mcp",
      "headers": { "X-Room-Code": "YOUR-CODE" }
    }
  }
}
```

After wiring the config, paste the protocol paragraph from this repo's [`CLAUDE.md`](./CLAUDE.md) into your agent's instructions or system prompt so it knows when to call `check_overlap`, `start_work`, and `complete_work`. The room code is passed as a tool argument.

## MCP tools

| Tool            | Purpose                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check_overlap` | Read-only — find active work in the room that overlaps with the caller (repo / branch / files / intent keywords). Call before `start_work`.                                            |
| `start_work`    | Register an active entry. Returns a `work_id`. The entry stays alive automatically while the calling MCP session is connected.                                                         |
| `complete_work` | Mark the entry shipped (or abandoned) and persist a summary.                                                                                                                           |
| `heartbeat`     | **Deprecated** (kept for legacy clients on the stateless transport). Refreshes `last_seen`. New agents do not need to call this — presence is automatic while the MCP session is open. |
| `list_active`   | Read-only — list every active entry in the room.                                                                                                                                       |

## CLI flags

- `connect <ROOM-CODE>` — wire up agent
- `disconnect` — remove what `connect` added
- `--dry-run` — print planned diffs, write nothing
- `--server <url>` — override server URL (default: `$KNOWORK_SERVER` or `https://knowork.app`)
- `--password <pw>` — exchange password for room token, embed as Bearer
- `--global` — write to user-scope (`~/.claude/...`) instead of project
- `--project` — force project-scope
- `--agent <name>` — force adapter (`claude-code` | `codex-cli` | `cursor` | `gemini-cli` | `vscode` | `windsurf` | `manual`)
- `--allow-token-in-repo` — permit writing the room token into a tracked file

## Environment variables

| Variable                    | Default                 | Description                                                                                                                                   |
| --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                      | `8787`                  | HTTP/WebSocket port                                                                                                                           |
| `DATA_DIR`                  | `./data`                | Where SQLite lives. Use `:memory:` for tests.                                                                                                 |
| `PUBLIC_BASE_URL`           | `http://localhost:8787` | Public URL — used for share links and MCP discovery                                                                                           |
| `LOG_LEVEL`                 | `info`                  | `trace` / `debug` / `info` / `warn` / `error`                                                                                                 |
| `HISTORY_LIMIT`             | `100`                   | Recently-shipped entries kept per room                                                                                                        |
| `RATE_LIMIT_ROOMS_PER_HOUR` | `10`                    | Room creations per IP per hour                                                                                                                |
| `RATE_LIMIT_WRITES_PER_MIN` | `60`                    | Write tool calls per IP per room per minute                                                                                                   |
| `DISCONNECT_GRACE_MS`       | `30000`                 | Window after MCP session close during which entries can resume on reconnect with the same session ID before they finalize as `session_closed` |
| `SESSION_MAX_AGE_MS`        | `86400000`              | Hard cap (default 24h) on any active entry's age, regardless of session connectivity. Backstop against zombie sessions                        |
| `HEARTBEAT_EXPIRY_MS`       | `90000`                 | Legacy stateless-fallback only — wall-clock window for entries created without an MCP session. No effect on session-bound entries             |
| `SWEEP_INTERVAL_MS`         | `15000`                 | How often the registry runs its sweep (max-age + legacy heartbeat)                                                                            |
| `SSE_REPLAY_BUFFER_SIZE`    | `1024`                  | Per-stream cap on SSE events retained for `Last-Event-ID` resumption. Bumps memory roughly linearly with the number of concurrent sessions    |

## Deployment behind a load balancer

Each agent's MCP session is server-managed in-process: the `StreamableHTTPServerTransport` lives in the Node process that handled the `initialize` request, and presence is derived from that session's lifetime. If you put Knowork behind a load balancer with multiple instances, you must enable **sticky routing on the `mcp-session-id` request header** so subsequent calls (and the bidirectional SSE stream) land on the same instance. Without sticky routing, a routed-elsewhere call falls through to the legacy stateless path and the session-driven presence guarantees no longer apply.

The same constraint applies to the SSE replay buffer that backs `Last-Event-ID` resumption: it lives in-memory in the process that opened the session. A reconnect routed to a different instance won't find the buffered events. Sticky routing on `mcp-session-id` covers both. If you ever need true cross-instance resumption, swap the in-memory `EventStore` (`apps/server/src/mcp/event-store.ts`) for a shared backend (e.g. a Redis stream keyed by `streamId`).

For single-instance deployments (Railway-style, the default), no extra configuration is needed.

## License

[MIT](./LICENSE)
