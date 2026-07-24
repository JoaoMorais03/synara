# 008 — macOS Simple ADE product focus

**Branch:** `feat/macos-simple-ade` (fork `JoaoMorais03/synara` only — not `main` until review)  
**Vision:** Simple, intuitive ADE for macOS. Selling point is simplicity (ORCA-like focus), not multi-surface complexity.

## Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Product surface | macOS desktop ADE only | User direction: no web product, no orchestration CLI, no External MCP hub |
| `apps/web` | Keep | Electron renderer + **local test harness only** (`bun run dev:test`) |
| `apps/marketing` | Deleted | No marketing site in repo |
| External MCP | Product surface removed | UI, CLI pair/serve, RPC fail-closed, HTTP 410; deep server modules deferred |
| Public package scripts | macOS DMG only | Linux/Windows dist scripts dropped from root package.json |
| Merge target | Feature branch only | Do not fast-forward fork `main` until user review |
| Other worktree | `strip-threading-agent-ui` left alone | Separate experiment |

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

- WS RPC External MCP methods fail closed with clear error
- Web `NativeApi` External MCP methods reject locally (no network)
- HTTP External MCP routes always return **410 Gone**
- Route integration tests reduced to fail-closed coverage; body-read unit tests kept
- This progress note

## Hygiene / polish (landed on same branch)

- Fix `apps/server` database connection store typecheck errors (readonly columns builder + Effect error types)
- Server `tsc --noEmit` clean after that fix
- CONTRIBUTING product-direction pointer to this plan
- Advanced settings session copy: desktop says "app session", not browser/pairing

## Branch commits (ahead of `main`, not merged)

```
74ba1469 fix(settings): use desktop wording for session sign-out
4f46ef83 docs: point contributors at simple macOS ADE direction
b15d3104 fix(database): clear server typecheck for connection store
a898d6d1 feat(ade): fail-close External MCP product APIs
14897ede feat(desktop): focus product on simple macOS ADE
```

Remote: `origin/feat/macos-simple-ade` on `JoaoMorais03/synara` (fork only).

## Still deferred (Phase C+)

Do **not** do casually without a dedicated pass:

1. **Delete** `apps/server/src/externalMcp/**` and contracts `externalMcp.ts`  
   - Still wired into `agentGateway/creationCoordinator`, server layers, persistence  
   - Full gut needs migration/compat plan and broader test rewrite
2. **Internal agent-gateway MCP** (`POST /mcp` for in-app agent tools)  
   - Different from External MCP pairing; keep until we redesign agent tooling
3. **Rename `@synara/cli`** → explicit desktop-backend package name
4. **Remote auth / pairing URL noise** trim for desktop-only assumption
5. **Automations** strip or keep (product call)
6. **CI release.yml** still builds linux/win for upstream compatibility — optional later
7. Rebrand / rename toward ORCA-style naming (product call)

## How to run

```sh
bun install
bun run dev          # product: Electron ADE
bun run dev:test     # testing only: backend + browser, no Electron
bun run dist:desktop:dmg
```

## PR stance

Open PR against fork or keep branch for local review. **Do not merge to `main` without explicit user approval.**
