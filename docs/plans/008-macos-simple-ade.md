# 008 — macOS Simple ADE product focus

**Branch:** `feat/macos-simple-ade` (fork `JoaoMorais03/synara` only — not `main` until review)  
**Vision:** Simple, intuitive ADE for macOS. Selling point is simplicity (ORCA-like focus), not multi-surface complexity.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Product surface | macOS desktop ADE only | User direction: no web product, no orchestration CLI, no External MCP hub |
| `apps/web` | Keep | Electron renderer + **local test harness only** (`bun run dev:test`) |
| `apps/marketing` | Deleted | No marketing site in repo |
| External MCP | **Fully removed** (Phase C) | Folder, contracts, WS/RPC/IPC, layers, HTTP routes, creation dual-path |
| Internal agent-gateway MCP | **Keep** | `POST /mcp` for in-app agents (`synara_*` tools) — different system |
| Migrations `074–078`, `080` | **Keep** | Historical SQLite lineage; empty tables cost nothing |
| `ThreadCreationSource: "external_mcp"` | **Keep literal** | Old projection rows may still carry it |
| Public package scripts | macOS DMG only | Linux/Windows dist scripts dropped from root package.json |
| Merge target | Feature branch only | Do not fast-forward fork `main` until user review |

## Phase A (landed)

Commit: `feat(desktop): focus product on simple macOS ADE`

- Delete `apps/marketing`
- `bun run dev` → desktop Electron path
- `bun run dev:test` / `dev:web` → backend + browser UI for testing (not a product)
- Remove External MCP settings UI + setup helpers
- Remove `mcp serve` / `mcp pair` CLI subcommands
- Delete `docs/external-mcp.md`; rewrite root README vision
- Root dist: macOS DMG only; drop canary/marketing scripts

## Phase B (landed)

Commit: `feat(ade): fail-close External MCP product APIs`

- Temporary fail-closed RPC/HTTP (superseded by Phase C full delete)

## Phase C (landed) — External MCP gut

Senior-level removal of the entire External MCP product subsystem:

### Deleted
- Entire `apps/server/src/externalMcp/**` (~28 files)
- `packages/contracts/src/externalMcp.ts` + index export
- WS methods / Rpc defs / NativeApi methods for External MCP management
- `canManageExternalMcp` + fail-closed Phase B handlers
- Client `wsNativeApi` stubs

### Unwired / simplified
- `serverLayers.ts` — no ExternalMcp* layers
- `effectServer.ts` — no `externalMcpRouteLayer`; ServerShape deps cleaned
- `creationCoordinator.ts` — **provider-session only** (in-app agent gateway)
- `toolRuntime.ts` — `AgentGatewayPrincipal` = provider session only
- `serverRuntimeState` — v2 schema, drop `externalMcpRuntimeSecret`
- `profileStatsArchive` — stop terminalizing `external_mcp_tasks` on purge

### Kept intentionally
- `apps/server/src/agentGateway/**` including `POST /mcp`
- Migrations creating `external_mcp_*` tables (historical)
- `"external_mcp"` creationSource enum for old data

## Hygiene / polish

- DB connection store typecheck fixes
- CONTRIBUTING product-direction pointer
- Desktop session wording in Advanced settings

## Branch commits (ahead of `main`, not merged)

See `git log origin/main..HEAD`. Key Phase C commit: External MCP full gut.

Remote: `origin/feat/macos-simple-ade` on `JoaoMorais03/synara` (fork only).

## Still deferred (Phase D+)

| Item | Notes |
|------|-------|
| Rename `@synara/cli` → desktop-backend package | Packaging/product naming |
| DROP TABLE migration for `external_mcp_*` | Optional cleanup; not required for boot |
| Remote auth / pairing URL trim | Desktop-only assumption pass |
| Automations strip | Product call |
| `release.yml` mac-only | CI/upstream compatibility |
| ORCA rebrand | Product branding |
| Internal agent-gateway MCP redesign | Different system; keep for in-app agents |

## How to run

```sh
bun install
bun run dev          # product: Electron ADE
bun run dev:test     # testing only: backend + browser, no Electron
bun run dist:desktop:dmg
```

## HTTP surfaces after Phase C

| Path | Status |
|------|--------|
| `POST /mcp` | **KEEP** (agent gateway) |
| `POST /mcp/external` | **GONE** (404) |
| `/api/mcp/external/*` | **GONE** |
| WS `server.*ExternalMcp*` | **GONE** from contracts |

## PR stance

Open PR against fork or keep branch for local review. **Do not merge to `main` without explicit user approval.**
