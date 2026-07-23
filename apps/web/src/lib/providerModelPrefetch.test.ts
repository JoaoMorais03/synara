// FILE: providerModelPrefetch.test.ts
// Purpose: Verifies new-thread model prefetch resolves providers/cwds and hits
//          the same React Query keys ChatView uses for listModels.
// Layer: Web lib tests

import type { ProviderKind } from "@synara/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prefetchProviderModelsForNewThread,
  providerModelsPrefetchQueryOptions,
  resolveNewThreadModelPrefetchCwd,
  resolveNewThreadModelPrefetchProvider,
  type ProviderModelPrefetchSettings,
} from "./providerModelPrefetch";
import { providerDiscoveryQueryKeys } from "./providerDiscoveryReactQuery";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSettings(
  overrides: Partial<ProviderModelPrefetchSettings> = {},
): ProviderModelPrefetchSettings {
  return {
    defaultProvider: "codex",
    cursorBinaryPath: "",
    cursorApiEndpoint: "",
    grokBinaryPath: "",
    openCodeBinaryPath: "",
    ...overrides,
  };
}


describe("resolveNewThreadModelPrefetchCwd", () => {
  it("prefers draft worktree, then project cwd, then server cwd", () => {
    expect(
      resolveNewThreadModelPrefetchCwd({
        draftWorktreePath: "/tmp/worktree",
        projectCwd: "/tmp/project",
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/worktree");

    expect(
      resolveNewThreadModelPrefetchCwd({
        draftWorktreePath: null,
        projectCwd: "/tmp/project",
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/project");

    expect(
      resolveNewThreadModelPrefetchCwd({
        projectCwd: null,
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/server");
  });
});


describe("prefetchProviderModelsForNewThread", () => {
  it("prefetches models and agents for the resolved provider", async () => {
    const queryClient = new QueryClient();
    const prefetchQuery = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchProviderModelsForNewThread(queryClient, {
      provider: "opencode" satisfies ProviderKind,
      settings: makeSettings({
        openCodeBinaryPath: "/bin/opencode",
      }),
      cwd: "/tmp/project",
    });

    expect(prefetchQuery).toHaveBeenCalledTimes(2);
    expect(prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.models("opencode", "/bin/opencode", null, null, "/tmp/project"),
    );
    expect(prefetchQuery.mock.calls[1]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.agents("opencode", "/bin/opencode", "/tmp/project"),
    );
  });

  it("prefetches only models for providers without agent discovery", async () => {
    const queryClient = new QueryClient();
    const prefetchQuery = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchProviderModelsForNewThread(queryClient, {
      provider: "cursor",
      settings: makeSettings({ cursorBinaryPath: "/bin/agent" }),
    });

    expect(prefetchQuery).toHaveBeenCalledTimes(1);
    expect(prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.models("cursor", "/bin/agent", null, null, null),
    );
  });
});
