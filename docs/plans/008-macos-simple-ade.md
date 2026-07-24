# 008 — macOS Simple ADE (CLI harness)

**Branch:** `feat/macos-simple-ade` (fork only — not `main` until review)

## Product model

Synara is a **simple desktop harness around bare native CLIs**.

- You open terminals and run `claude` / `codex` / etc. The CLIs own agent brains.
- Synara owns: window shell, projects, terminals, git, worktrees, local state.
- **Not** an MCP hub, **not** an in-app agent control plane, **not** scheduled automations.

## Done on this branch

| Phase | What |
|-------|------|
| A | Marketing gone; desktop default; External MCP UI/CLI; `dev:test` harness |
| C | External MCP server/contracts deleted |
| D | In-app agent gateway (`POST /mcp`, `synara_*`) deleted |
| E | **Automations product fully removed** (server, UI, WS, contracts) |
| E | **`@synara/cli` → `@synara/backend`** (package + turbo filters + scripts) |
| E | **Claude host prompt append emptied** (no Synara personality injection) |

## Keep (harness)

| Area | Why |
|------|-----|
| Terminals | Bare CLI surface |
| Git / worktrees / PRs | Harness features you want |
| Orchestration + chat UI | Still the current session/UI model (see below) |
| Provider adapters | Still how chat sessions talk to CLIs today |
| Local loopback auth | Desktop needs a local backend handshake |
| Historical enums | `dispatchOrigin: "automation"`, old MCP labels |

## Honest gap: “just open a terminal and run claude”

**Today:** chat still spawns CLIs through **provider adapters** (ACP/SDK/app-server) and streams into the chat timeline. That is **not** “open a terminal and type `claude`.” It is why `provider/` is large (~100+ files).

**True bare-CLI harness would mean:**

1. Remove (or stop using) chat-as-embedded-agent-session.
2. “Start Claude” = open a **terminal** in the project cwd with the binary.
3. Delete most of `provider/Layers/*Adapter` over time once nothing calls them.

That is a **product redesign**, not a drive-by delete. Doing it mid-chat-stack without a terminal-first UX would leave a dead ADE.

**Next work if you want bare terminals only:** design “New session → Terminal tab running `claude`” and retire provider session UI paths one provider at a time.

## Still open (smaller)

| Item | Notes |
|------|-------|
| Remote pairing / multi-client auth trim | Local-only ADE; pairing routes still exist for legacy remote |
| Empty MCP / automation **tables** | Keep migrations; optional DROP migration later |
| CI `release.yml` linux/win | Optional mac-only |
| ORCA rebrand | Naming later |
| Orphan `apps/marketing/node_modules` | Disk junk |

## Run

```sh
bun install
bun run dev          # Electron ADE
bun run dev:test     # browser test harness
bun run dist:desktop:dmg
```

## PR

Do **not** merge to `main` without explicit approval.
