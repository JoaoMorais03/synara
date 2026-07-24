// FILE: bareCliLaunch.ts
// Purpose: Map Synara providers to interactive CLI launch commands for terminal-first threads.
// Layer: Web helpers for bare-CLI new-thread flows (no Synara agent chat UI).

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProviderStatus,
} from "@synara/contracts";
import {
  defaultTerminalTitleForCliKind,
  type TerminalCliKind,
  type TerminalCommandIdentity,
} from "@synara/shared/terminalThreads";

import { isProviderUsable } from "./providerAvailability";

const MAX_BARE_CLI_LAUNCH_OPTIONS = 3;

/** Interactive TUI / REPL command typed into a fresh PTY. */
export function interactiveCliCommandForProvider(provider: ProviderKind): string {
  switch (provider) {
    case "codex":
      return "codex";
    case "claudeAgent":
      return "claude";
    case "cursor":
      return "cursor-agent";
    case "grok":
      return "grok";
    case "opencode":
      return "opencode";
  }
}

export function terminalCliKindForProvider(provider: ProviderKind): TerminalCliKind {
  switch (provider) {
    case "codex":
      return "codex";
    case "claudeAgent":
      return "claude";
    case "cursor":
      return "cursor";
    case "grok":
      return "grok";
    case "opencode":
      return "opencode";
  }
}

export function providerKindForTerminalCliKind(cliKind: TerminalCliKind): ProviderKind {
  switch (cliKind) {
    case "codex":
      return "codex";
    case "claude":
      return "claudeAgent";
    case "cursor":
      return "cursor";
    case "grok":
      return "grok";
    case "opencode":
      return "opencode";
  }
}

export function terminalIconKeyForCliKind(cliKind: TerminalCliKind): TerminalCommandIdentity["iconKey"] {
  return terminalIdentityForProvider(providerKindForTerminalCliKind(cliKind)).iconKey;
}

export function terminalIdentityForProvider(provider: ProviderKind): TerminalCommandIdentity {
  const cliKind = terminalCliKindForProvider(provider);
  return {
    cliKind,
    iconKey:
      cliKind === "codex"
        ? "openai"
        : cliKind === "claude"
          ? "claude"
          : cliKind === "cursor"
            ? "cursor"
            : cliKind === "grok"
              ? "grok"
              : "opencode",
    title: defaultTerminalTitleForCliKind(cliKind),
  };
}

export const BARE_CLI_PROVIDER_ORDER: readonly ProviderKind[] = [
  "claudeAgent",
  "codex",
  "cursor",
  "grok",
  "opencode",
] as const;

/** Favorite first, then usable CLIs, then remaining catalog entries — always fill up to 3. */
export function listUsableBareCliProviders(input: {
  statuses: readonly ServerProviderStatus[];
  favoriteProvider: ProviderKind;
}): ProviderKind[] {
  const usable = BARE_CLI_PROVIDER_ORDER.filter((provider) => {
    const status = input.statuses.find((entry) => entry.provider === provider) ?? null;
    return isProviderUsable(status);
  });
  const seen = new Set<ProviderKind>();
  const result: ProviderKind[] = [];
  const push = (provider: ProviderKind) => {
    if (seen.has(provider) || result.length >= MAX_BARE_CLI_LAUNCH_OPTIONS) {
      return;
    }
    seen.add(provider);
    result.push(provider);
  };
  push(input.favoriteProvider);
  for (const provider of usable) {
    push(provider);
  }
  for (const provider of BARE_CLI_PROVIDER_ORDER) {
    push(provider);
  }
  return result;
}

export function bareCliProviderLabel(provider: ProviderKind): string {
  return PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}
