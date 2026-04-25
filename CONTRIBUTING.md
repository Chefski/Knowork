# Contributing to agent-presence-board

Thanks for your interest! This is a small, focused project — contributions that align with the goals (single self-hostable Node service, no required external dependencies, MCP-first) are welcome.

## Dev setup

Prereqs: Node 20+ and pnpm 9+.

```bash
git clone <repo>
cd agent-presence-board
pnpm install
pnpm dev
```

This starts:

- The Node server on `http://localhost:8787`
- The Vite UI dev server with HMR on `http://localhost:5173`

The Vite dev server proxies `/api` and `/ws` to the Node server, so you can use either origin.

## Running tests

```bash
pnpm test           # all packages
pnpm typecheck      # type-check everything
pnpm lint           # oxlint
pnpm format         # prettier --write
```

Tests use `:memory:` SQLite so nothing is written to disk.

## PR conventions

- **Small, focused PRs.** One concern per PR.
- **Tests required** for new behavior. Bug fixes should include a regression test.
- **Update the spec** if you change behavior. The source of truth lives in `openspec/specs/agent-presence-board/spec.md`.
- **Keep the dependency surface small.** Adding a new dependency requires justification in the PR description.
- **No required external services.** A self-hoster must still be able to `docker run` one container.

## Pre-commit hook

Husky + lint-staged run `oxlint --fix` and `prettier --write` on staged files. If something fails, fix it locally — please do not bypass with `--no-verify`.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Be kind.

## Questions

Open a discussion or file an issue.
