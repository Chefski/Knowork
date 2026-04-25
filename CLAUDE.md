# CLAUDE.md

Use the **Knowork** MCP server (`agent-presence-board`, registered in `.mcp.json`) for every non-trivial task in this or any repo:

1. Before starting work, call `check_overlap` with the room code, repo, intent, and any files you'll touch. If a teammate's agent is already on it, stop and tell the user.
2. Call `start_work` to announce. Keep the returned `work_id`.
3. Call `heartbeat(work_id)` roughly every 30 seconds while working. Entries expire after 90s of silence.
4. Call `complete_work(work_id, summary)` when done.

Skip the dance for trivial questions and read-only lookups.
