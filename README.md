# Synara

**Simple, intuitive ADE for macOS.**

Synara is a local-first macOS desktop app for coding with the AI agents and subscriptions you already use — without a web product, without a public orchestration CLI, and without External MCP pairing. One focused ADE: chats, terminals, browser previews, diffs, branches, and handoffs in a single window.

![Synara app showing parallel agent threads, terminal output, and project navigation](assets/prod/readme-screenshot.jpeg)

## Product focus

- **macOS desktop only** — Electron shell + local backend. No hosted web product, no marketing site in this repo.
- **Simple ADE** — start working; avoid configuration sprawl and multi-surface complexity.
- **Your agents, local** — Claude Code, Codex, Cursor, Grok, OpenCode, and related CLIs you already authorize.
- **CLI harness, not agent control plane** — native provider CLIs only. No External MCP hub, no in-app agent gateway MCP, no `synara_*` tools injected into agent sessions.
- **`apps/web` is not a product** — it is the desktop renderer. The same stack can run in a local browser **for testing only** (see below).

## What it does

- Use AI accounts you already pay for.
- Run parallel work across projects, threads, and isolated Git worktrees.
- Keep split chats, terminals, browser previews, and agent output in one window.
- Hand off a thread to another provider with shared context.
- Review diffs, branches, commits, pushes, and PRs from the app.
- Keep workspace data local on your machine.

## How to use

> [!WARNING]
> You need the relevant provider CLIs installed and authorized (for example [Codex CLI](https://github.com/openai/codex) for Codex sessions).

### Install (macOS)

Use a macOS build from [Releases](https://github.com/Emanuele-web04/Synara/releases) when available, or run from source:

```sh
bun install
bun run dev
```

`bun run dev` starts the **desktop** ADE (Electron + renderer HMR + local backend). That is the product path.

### Local testing without Electron

Building/restarting full Electron is slower when you only need UI + backend. Keep using the web stack as a **dev harness only** — never as a shipped web app:

```sh
# Backend + browser UI (no Electron). Prefer this for quick UI iteration.
bun run dev:test

# Aliases / pieces:
bun run dev:web        # same as dev:test
bun run dev:server     # backend only
bun run dev:renderer   # Vite renderer only (if backend already running)
```

| Command | What it runs | Use for |
|---------|----------------|---------|
| `bun run dev` | Desktop (Electron) + renderer | Real product behavior |
| `bun run dev:test` | Local backend + browser UI | Faster testing / UI work |
| `bun run dev:renderer` | Vite only | HMR against an existing backend |

> [!IMPORTANT]
> **There is no web product.** Browser mode exists so contributors and agents can test without packaging Electron. Do not treat it as a hosted or multi-user surface, and do not reintroduce marketing/public web positioning around it.

### Package a macOS DMG

```sh
bun run dist:desktop:dmg
# or architecture-specific:
bun run dist:desktop:dmg:arm64
bun run dist:desktop:dmg:x64
```

## Privacy

Synara runs as the workspace layer on your machine. There is no Synara cloud holding your repositories, chats, or project history.

The provider you choose still receives the prompts, file snippets, diffs, terminal output, or tool results needed for a session — that traffic goes to the provider you picked, not through a separate Synara-hosted workspace.

## Notes

Synara is early. Expect bugs, rough edges, and fast-moving internals.

This fork/workspace is steered toward a **simple macOS ADE**. Contributions that reintroduce web hosting, public MCP pairing, or heavy multi-platform product surfaces are out of scope unless explicitly requested.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? [Open a GitHub issue](https://github.com/Emanuele-web04/synara/issues).
