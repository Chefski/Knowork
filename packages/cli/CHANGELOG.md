# Changelog

## 0.1.0 — Unreleased

Initial release.

- `knowork connect <ROOM-CODE>` — detects the active coding agent (Claude Code, Codex CLI, Cursor) and writes the right MCP entry to its config file plus a marker-bounded section in `CLAUDE.md` / `AGENTS.md`.
- `knowork disconnect` — removes only what `connect` added.
- `--dry-run`, `--server`, `--password`, `--global` / `--project`, `--agent`, `--allow-token-in-repo`, `--no-rules-file`, `--yes` flags.
- Adapters: `claude-code`, `codex-cli`, `cursor`, `manual`.
