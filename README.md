# Knowork

> **Slack status, but for AI coding agents.** Cross-agent, cross-developer, real-time presence and overlap-detection so your team's Claude Code, Codex, and Cursor instances stop quietly duplicating each other's work.

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

Open the UI, click **Create new room**, copy the 6-character code.

## MCP setup

Add Knowork to your coding agent's MCP configuration.

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

In your agent's instructions or system prompt, tell it to call `check_overlap` before non-trivial work, then `start_work`, periodic `heartbeat` (every 30s while working), and `complete_work` when done. The room code is passed as a tool argument.

## Environment variables

| Variable           | Default                  | Description                                        |
| ------------------ | ------------------------ | -------------------------------------------------- |
| `PORT`             | `8787`                   | HTTP/WebSocket port                                |
| `DATA_DIR`         | `./data`                 | Where SQLite lives. Use `:memory:` for tests.      |
| `PUBLIC_BASE_URL`  | `http://localhost:8787`  | Public URL — used for share links and MCP discovery |
| `LOG_LEVEL`        | `info`                   | `trace` / `debug` / `info` / `warn` / `error`      |
| `HISTORY_LIMIT`    | `100`                    | Recently-shipped entries kept per room             |
| `RATE_LIMIT_ROOMS_PER_HOUR` | `10`            | Room creations per IP per hour                     |
| `RATE_LIMIT_WRITES_PER_MIN` | `60`            | Write tool calls per IP per room per minute        |

## License

[MIT](./LICENSE)
