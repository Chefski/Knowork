# agent-presence-board

> **Slack status, but for AI coding agents.** Cross-agent, cross-developer, real-time presence and overlap-detection so your team's Claude Code, Codex, and Cursor instances stop quietly duplicating each other's work.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## What it is

Teams using AI coding agents have no shared visibility into what those agents are currently doing across team members. When Patryk's Claude Code is refactoring `auth.ts`, Alice has no way to know — so she may ask Codex to do the same thing 30 minutes later, leading to duplicate work, merge conflicts, and wasted compute.

`agent-presence-board` is a single self-hostable Node.js service that fixes that:

- An **MCP server** any coding agent (Claude Code, Codex, Cursor, etc.) can connect to
- An **agent-callable overlap check** so agents can self-coordinate before starting work
- A **live web board** showing who's working on what, in real time
- A **"recently shipped" log** so a teammate joining late can see what just finished
- **Heartbeat-based liveness** with explicit completion; entries vanish automatically when an agent dies

It runs as one Node process, on one port, with one optional file for state. No external services required.

## Quick start

### Run with Docker

```bash
docker run -p 8787:8787 -v $(pwd)/data:/data ghcr.io/<org>/agent-presence-board:latest
```

Open `http://localhost:8787`, click **Create new room**, copy the 6-character code.

### Configure your agent

Add the MCP server to your coding agent (example for Claude Code):

```json
{
  "mcpServers": {
    "agent-presence-board": {
      "transport": "http",
      "url": "http://localhost:8787/mcp",
      "headers": { "X-Room-Code": "YOUR-CODE" }
    }
  }
}
```

Now ask the agent to do anything that touches code — it will call `check_overlap` and `start_work` automatically. Watch the board light up.

## Local development

```bash
git clone <repo>
cd agent-presence-board
pnpm install
pnpm dev
```

- Server: `http://localhost:8787`
- UI dev server (HMR): `http://localhost:5173`
- MCP endpoint: `http://localhost:8787/mcp`

## Self-hosting

This is a first-class goal. Pick the path that fits your environment:

- [Self-host with Docker](#self-host-with-docker)
- [Self-host on Railway / Render / Fly](#self-host-on-railway--render--fly)
- [Behind SSO](#behind-sso)
- [MCP setup](#mcp-setup)
- [Backups](#backups)
- [Known limits](#known-limits)

### Self-host with Docker

Single container, one volume, one port:

```bash
docker run -d \
  --name agent-presence-board \
  -p 8787:8787 \
  -v apb-data:/data \
  -e PUBLIC_BASE_URL=https://apb.example.com \
  ghcr.io/<org>/agent-presence-board:latest
```

Or with `docker-compose.yml` (provided in the repo):

```bash
docker compose up -d
```

**Behind a reverse proxy** (Caddy, nginx, Traefik): forward both HTTP and WebSocket upgrades to the container. Make sure to set `Host`, `X-Forwarded-For`, and `X-Real-IP`. Set `PUBLIC_BASE_URL` to the public origin.

Caddy example:

```caddy
apb.example.com {
  reverse_proxy localhost:8787
}
```

### Self-host on Railway / Render / Fly

Any platform that runs a Node 20+ Docker image works. Suggested settings:

| Knob              | Value                                      |
| ----------------- | ------------------------------------------ |
| Image             | `ghcr.io/<org>/agent-presence-board:latest`|
| Port              | `8787`                                     |
| Volume mount      | `/data` → 1 GB persistent disk             |
| Health check path | `/health`                                  |
| Env vars          | `PUBLIC_BASE_URL`, optional rate-limit knobs |

Railway / Render / Fly all support persistent volumes; create one and mount it at `/data`.

### Behind SSO

Room codes are the only secret in v0. For stronger guarantees, put the service behind an authenticating reverse proxy:

- **oauth2-proxy** in front of the container, pointed at your Google / GitHub / OIDC provider.
- **Cloudflare Access** with a policy on `apb.example.com` requiring your team identity.
- **Tailscale** with the service published only over the tailnet.

The app is unaware of the proxy — no app changes required. Native `AUTH_MODE=oidc` is planned post-v0.

### MCP setup

Once the service is running, add it to your coding agent's MCP configuration.

**Claude Code** (`~/.claude/mcp.json` or per-project `.mcp.json`):

```json
{
  "mcpServers": {
    "agent-presence-board": {
      "transport": "http",
      "url": "https://apb.example.com/mcp"
    }
  }
}
```

**Codex CLI** (`~/.codex/config.toml`):

```toml
[[mcp_servers]]
name = "agent-presence-board"
transport = "http"
url = "https://apb.example.com/mcp"
```

**Cursor** (Settings → MCP → Add Server):

```json
{
  "name": "agent-presence-board",
  "transport": "http",
  "url": "https://apb.example.com/mcp"
}
```

In your agent's instructions or system prompt, tell it to call `check_overlap` before non-trivial work, then `start_work`, periodic `heartbeat` (every 30s while working), and `complete_work` when done. The room code is passed as a tool argument.

### Backups

State lives in `DATA_DIR/data.db` (a single SQLite file). Back it up with `cp` or any volume-aware backup tool:

```bash
docker run --rm \
  -v apb-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /data/data.db /backup/data.db.$(date +%F)
```

`DATA_DIR` layout:

```
data/
└── data.db        # rooms + completed_entries
```

Active state (the in-process registry) is intentionally NOT persisted — it rebuilds from agent heartbeats within ~90s of restart.

### Known limits

v0 is intentionally small. Document these so adopters set expectations correctly:

- **Single-instance only.** No HA cluster mode. A single Node process handles thousands of WebSocket connections fine; horizontal scaling is a future Redis-backed adapter.
- **Restart wipes active entries.** They reconverge from heartbeats within 90s. SQLite history is unaffected.
- **No native auth.** Room code is the capability. Use a reverse proxy (oauth2-proxy / Cloudflare Access / Tailscale) for stronger guarantees.
- **Rate limits are advisory.** In-memory token buckets per process; a determined attacker against a public deploy will need stricter front-line limits.
- **TLS is your responsibility.** The app speaks plain HTTP; terminate TLS at a proxy / load balancer / Tailscale.

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
| `DEMO_BANNER`      | `false`                  | Show "Demo only — self-host for real use" banner   |

## FAQ

**Can my agent and my teammate's agent collaborate from different machines?**
Yes — that's the whole point. Both connect to the same instance via the same room code.

**Do I need a database?**
No external database. SQLite lives inside the data directory.

**Is there auth?**
The room code is the capability. For stronger guarantees, put the service behind oauth2-proxy / Cloudflare Access / Tailscale — see [Behind SSO](#behind-sso).

**What happens on restart?**
Active entries are rebuilt from agent heartbeats within ~90 seconds. Recently-shipped history persists.

## License

[MIT](./LICENSE)
