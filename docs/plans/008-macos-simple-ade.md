# 008 — macOS Simple ADE product focus

**Branch:** `feat/macos-simple-ade` (fork `JoaoMorais03/synara` only — not `main` until review)  
**Vision:** Simple, intuitive ADE for macOS — a **harness around native CLIs**, not an agent that orchestrates Synara via MCP.

## Product model (authoritative)

Synara wraps CLIs you already use (Claude Code, Codex, Cursor, Grok, OpenCode, …) with a focused desktop shell: chats UI, terminals, worktrees, diffs, providers, etc.

- Users talk to **native CLIs**, not to “Synara as an MCP server.”
- Agents **never** need to call back into Synara (`synara_*` tools / `POST /mcp` are gone).
- Browser UI (`bun run dev:test`) is a **local test harness only**, not a web product.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Product surface | macOS desktop ADE only | Simple ADE vision |
| `apps/web` | Keep as Electron renderer + test harness | Not a shipped web product |
| External MCP | **Deleted** (Phase C) | No remote orchestration hub |
| In-app agent gateway MCP | **Deleted** (Phase D) | CLI harness — agents do not interact with Synara |
| Automations MCP report tools | Envelope rewritten | No `synara_report_*` instructions; UI/backend automations may need later redesign |
| Migrations for empty MCP tables | **Keep** | Historical SQLite lineage |
| `creationSource` / historical tool labels | **Keep** | Old projection/UI rows |

## Phase A–C (landed)

- Marketing site removed; desktop default; External MCP product surface + full server/contracts gut
- README ADE vision; `dev:test` for browser-without-Electron testing

## Phase D (landed) — Agent gateway MCP removed

### Deleted
- Entire `apps/server/src/agentGateway/**`
- `packages/contracts/src/agentGateway.ts` (+ tests)
- `POST /mcp` route, credentials, operation repository, creation coordinator, tool catalog

### Provider unhook
- Claude / Codex / Cursor / Grok / OpenCode: **no** Synara MCP injection, session leases, or “use synara_* tools” harness policy
- Codex managed TOML no longer appends `[mcp_servers.synara]`

### Kept / moved
- `provider/threadMessagePagination.ts` — thread:// mention transcript paging (was inside gateway)
- Host identity prompts may remain; not MCP tool policy
- Migrations `070` / `072` AgentGatewayOperations (empty tables OK)

### Blast radius (honest)
| Gone | Still works |
|------|-------------|
| Agent creates/steers Synara threads via tools | User chats via ADE UI + native CLIs |
| Agent multi-thread fan-out via Synara | Terminals, worktrees from UI |
| Agent automation report/memory MCP tools | Provider sessions as plain CLIs |
| `POST /mcp` | Historical UI labels for old tool calls |

## How to run

```sh
bun install
bun run dev          # product: Electron ADE
bun run dev:test     # testing only: backend + browser
bun run dist:desktop:dmg
```

## HTTP after Phase D

| Path | Status |
|------|--------|
| `POST /mcp` | **GONE** |
| `POST /mcp/external` | **GONE** |
| WS app RPCs (chats, settings, …) | **KEEP** |

## Still deferred

| Item | Notes |
|------|-------|
| Automations product redesign | Report/memory protocol lost with gateway |
| `@synara/cli` package rename | Packaging |
| DROP TABLE empty MCP tables | Optional hygiene |
| Remote auth trim / ORCA rebrand / mac-only CI | Product calls |

## PR stance

**Do not merge to `main` without explicit user approval.**
