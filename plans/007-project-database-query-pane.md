# 007 — Project database query pane (simple)

Status: **ready to merge** on fork `feat/database-query-pane` (P0–P4 shipped; other worktree independent)  
Scope class: small **query tool**, not a DB IDE / TablePlus clone  
Primary job: run a quick SQL query **without leaving chat** (right dock)

---

## Product constraints (locked)

| Do                                                             | Don't                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| Multi connection per project (`local` / `dev` / `prd`)         | Schema designer, ER diagrams, migration tooling            |
| Postgres + SQLite only (v1)                                    | MySQL/etc until needed                                     |
| Right dock = **sidebar only**, stays on chat                   | Dock must **never** navigate to a full page                |
| Hover project action = full-page manager (connections + query) | Dock opening full page                                     |
| Simple: pick connection → write SQL → run → see rows           | Query builder UI, visual table editor, heavy introspection |
| Native server drivers + RPC                                    | Shell out to `psql` / `sqlite3` as the query path          |
| Secrets via server secret store                                | Passwords in localStorage / project JSON                   |

**UX intent (canonical):** while drafting a prompt in chat, open right-dock **Database**, run a small SELECT, copy/use results, stay in the thread.

---

## Entry points (mirror existing patterns)

### A) Right dock `+` menu → sidebar only

- Files: `rightDockStore.logic.ts` (`RIGHT_DOCK_PANE_KINDS`), `rightDockPaneMeta.tsx`, `SingleChatSurface.tsx` `renderDockPane`
- Add kind: `database`
- Render: `DockDatabasePane` (`mode="sidebar"`)
- Scope: host **thread** only hosts the pane; **connections** are keyed by **projectId**
- Opening dock never calls `navigate(...)`

### B) Project hover toolbar → full page

- File: `Sidebar.tsx` (`SidebarSectionToolbar` next to terminal / PR / new thread)
- Icon: database; tooltip: `Databases` or `New database connection` (prefer **Databases** → manager; empty state CTA = add connection)
- Action: `navigate({ to: "/databases", search: { projectId } })` (same family as `/pull-requests`)
- Full page = same core UI as dock, larger layout (`mode="page"`), for setup + longer sessions

### Shared surface

- One component tree: `DatabaseQuerySurface` with `mode: "sidebar" | "page"`
- Shared connection store + query runner; only chrome/layout differs

---

## Architecture

```
UI (web)
  DatabaseQuerySurface
    ConnectionPicker | AddConnectionForm
    SqlEditor (simple textarea/monaco-lite later)
    Run / Cancel
    Results table (capped rows) | Error

WS/RPC → server
  database.listConnections
  database.upsertConnection   // metadata only
  database.deleteConnection
  database.testConnection
  database.query              // { connectionId, sql, rowLimit? }
  database.cancelQuery?       // optional P1

Server
  ConnectionManager
    pool/handle per connectionId
    engines: postgres | sqlite
  SecretStore (password / tokens)
  Guards: timeout, row cap, optional readOnly flag
```

**Not in scope for runtime:** PTY, terminal threads, CLI result scraping.

---

## Data model (v1)

```ts
type DbEngine = "postgres" | "sqlite";

type ProjectDbConnection = {
  id: string;
  projectId: ProjectId;
  label: string; // "local" | "dev" | "prd" | free text
  engine: DbEngine;
  // postgres
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  ssl?: boolean;
  // sqlite
  filePath?: string; // abs or project-relative; resolve server-side
  // flags
  readOnly?: boolean; // default true for labels matching /prd|prod/i optional later
  passwordSecretName?: string; // ServerSecretStore key; never returned to client
  createdAt: string;
  updatedAt: string;
};
```

Persistence options (pick in P1 implementation, prefer simplest that matches server patterns):

1. Rows in Synara state DB (project-scoped table) + secrets in `secretsDir`
2. Or JSON under project/server state dir if no migration budget

Client never receives password; only `hasPassword: boolean`.

---

## Query execution rules (v1)

- Default `rowLimit = 200` (hard cap e.g. 1000)
- Default `timeoutMs = 15_000`
- Return: `{ columns, rows, truncated, durationMs }` or structured error
- Cancel: best-effort abort on driver (P1 if easy, else P2)
- Writes allowed unless `readOnly`; show simple confirm on non-SELECT if easy, else skip for v1
- SQLite: open **user** file only; never Synara `state.sqlite`

Drivers (suggested):

- Postgres: lightweight `postgres` (or existing ecosystem dep if present)
- SQLite: Bun sqlite / `node:sqlite` — match monorepo runtime

---

## Phased roadmap (implementation order)

### P0 — Shell wiring (no real DB yet)

**Goal:** entry points exist; empty surface; no driver deps.

- [x] `RIGHT_DOCK_PANE_KINDS` += `"database"`; meta icon/label **Database**
- [x] `SingleChatSurface` case → `DockDatabasePane` (shared surface, sidebar mode)
- [x] Route `/databases` + search `{ projectId }`
- [x] Hover toolbar button → navigate full page
- [x] Shared `DatabaseQuerySurface` empty states:
  - no project → “Select a project…”
  - no connections → empty shell (add connection in P1)
- [x] Tests: dock kinds + meta + database singleton reopen
- [ ] Manual: dock stays on chat; hover opens page only

**Exit:** both entry points open; zero secret/driver work.

### P1 — Connections + secrets + test

**Goal:** multi connection per project; test works for PG + SQLite.

- [x] Contracts: connection schemas + RPC methods
- [x] Server: CRUD + `testConnection`; secret set/remove on password change
- [x] UI: add/edit/delete connection form (minimal fields)
- [x] Connection picker (label + engine badge)
- [x] Persist per `projectId`; list on surface mount
- [x] Tests: secret never in list payload; probe validation

**Exit:** can save `local`/`dev`/`prd` and green “Test”.

### P2 — Query runner (the core job)

**Goal:** sidebar quick query for prompt work.

- [x] `database.query` RPC + execute helpers (open per query; no long-lived pool yet)
- [x] Simple SQL input + Run + loading + error
- [x] Results table (columns + rows, truncated flag)
- [x] Copy results (TSV/markdown) — high value for “write my prompt”
- [x] Last-used connection per project (local UI persist)
- [x] Row limit enforced server-side (default 200 / max 1000)
- [x] Tests: readonly SQL classifier, cell serialize, copy formatters

**Exit:** dock: pick conn → SQL → rows without leaving chat.

### P3 — Polish (only if still simple)

- [ ] Cancel in-flight query
- [ ] Query history per connection (last N, local or server)
- [ ] Read-only default heuristic for prod labels
- [ ] Keyboard: Cmd/Ctrl+Enter run
- [ ] Full-page slightly richer layout only (more vertical space) — **same features as dock**

**Out of scope until explicitly reopened:** explain plans, ERD, CSV import, agent auto-SQL, multi-statement scripts UI, connection tunneling UI.

### P4 — Schema browser (IntelliJ-style tree)

- [x] Collapsible left **Schema** panel (toggle; off by default in dock, on in full page)
- [x] Tree: namespace → tables → columns + types + pk
- [x] `database.inspectSchema` RPC (PG information_schema / SQLite pragma)
- [x] Double-click table inserts `select * from … limit 100`
- [x] Schema identifiers feed SQL autocomplete

---

## File touch map (expected)

| Area        | Paths                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| Dock kinds  | `apps/web/src/rightDockStore.logic.ts`, `rightDockPaneMeta.tsx`, tests |
| Dock render | `apps/web/src/components/chat/SingleChatSurface.tsx`                   |
| Surface UI  | `apps/web/src/components/database/*` (new)                             |
| Hover       | `apps/web/src/components/Sidebar.tsx`                                  |
| Route       | `apps/web/src/routes/_chat.databases*.tsx` (new)                       |
| Contracts   | `packages/contracts/src/database.ts` (new) + rpc index                 |
| Server      | `apps/server/src/database/*` (new) + wire RPC                          |
| Secrets     | reuse `ServerSecretStore`                                              |

---

## Upstream contribution strategy

1. Build on fork `JoaoMorais03/synara` against this plan.
2. Before large PR: open issue describing **sidebar quick query** + multi-conn; link phases.
3. Prefer upstream PRs as **P0** then **P1/P2** slices — never one mega PR.
4. UI PR must include before/after screenshots (CONTRIBUTING).

---

## Agent follow-up checklist

When implementing, do in order **P0 → P1 → P2**; do not skip to schema browser.

1. Branch from `upstream/main`: `feat/database-query-pane`
2. Implement P0 only → smoke in app
3. P1 connections
4. P2 query + copy for prompt workflow
5. Stop unless user asks P3

### Acceptance (MVP = end of P2)

- [ ] From chat: `+` → Database → pane in **right dock only**
- [ ] Chat remains open; no full-page navigation from dock
- [ ] Hover project → `/databases?projectId=…` full page
- [ ] ≥2 connections on one project (e.g. local + prd)
- [ ] Postgres and SQLite test + simple SELECT
- [ ] Results visible; copy-friendly
- [ ] Passwords not in client state dumps

---

## Decision log

| Decision       | Choice               | Why                                       |
| -------------- | -------------------- | ----------------------------------------- |
| Product weight | Simple query tool    | Prompt/context while coding, not DB admin |
| Dock behavior  | Sidebar only         | Keep chat context                         |
| Full page      | Hover / route only   | Setup + longer use; not dock              |
| Engines        | PG + SQLite          | User request                              |
| Multi-conn     | Per project labels   | local/dev/prd                             |
| Runtime        | Server drivers + RPC | Reliable vs CLI parsing                   |
| Secrets        | ServerSecretStore    | Match Synara patterns                     |
