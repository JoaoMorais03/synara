// FILE: providerUpdates.test.ts
// Purpose: Covers provider-update filtering shared by notifications and settings.
// Layer: Web utility tests
// Exports: Vitest suites for providerUpdates.ts

import type { ProviderKind, ServerProviderStatus, ServerSettings } from "@synara/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getVisibleProviderUpdateStatuses,
  isProviderUpdateActive,
  providerUpdateNotificationKey,
  shouldOfferProviderUpdateAction,
  shouldShowProviderUpdateStatus,
  withProviderUpdateTimeout,
} from "./providerUpdates";

afterEach(() => {
  vi.useRealTimers();
});

function providerStatus(
  provider: ProviderKind,
  overrides: Partial<ServerProviderStatus> = {},
): ServerProviderStatus {
  return {
    provider,
    status: "ready",
    available: true,
    authStatus: "authenticated",
    version: "1.0.0",
    checkedAt: "2026-06-10T10:00:00.000Z",
    versionAdvisory: {
      status: "behind_latest",
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      updateCommand: "npm install -g provider@latest",
      canUpdate: true,
      checkedAt: "2026-06-10T10:00:00.000Z",
      message: "Update available.",
    },
    ...overrides,
  };
}

function serverSettings(overrides: Partial<ServerSettings["providers"]> = {}): ServerSettings {
  const provider = {
    enabled: true,
    binaryPath: "",
    customModels: [],
  };

  return {
    enableAssistantStreaming: false,
    enableProviderUpdateChecks: true,
    defaultThreadEnvMode: "local",
    addProjectBaseDirectory: "",
    textGenerationModelSelection: { provider: "codex", model: "gpt-5.4-mini" },
    providers: {
      codex: { ...provider, binaryPath: "codex", homePath: "" },
      claudeAgent: { ...provider, binaryPath: "claude", launchArgs: "" },
      cursor: { ...provider, binaryPath: "cursor-agent", apiEndpoint: "" },
      grok: { ...provider, binaryPath: "grok" },
      opencode: {
        ...provider,
        binaryPath: "opencode",
        serverUrl: "",
        serverPasswordConfigured: false,
        experimentalWebSockets: false,
      },
      ...overrides,
    },
    skills: { disabled: [] },
  };
}

describe("getVisibleProviderUpdateStatuses", () => {


  it("waits for server settings before showing provider updates", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("codex")],
      serverSettings: null,
    });

    expect(result).toEqual([]);
  });

  it("excludes provider updates when automatic update checks are disabled", () => {
    const result = getVisibleProviderUpdateStatuses({
      providers: [providerStatus("codex")],
      serverSettings: { ...serverSettings(), enableProviderUpdateChecks: false },
    });

    expect(result).toEqual([]);
  });

});



describe("isProviderUpdateActive", () => {
  it("only treats queued and running provider updates as active", () => {
    const queuedState = {
      status: "queued",
      startedAt: null,
      finishedAt: null,
      message: null,
      output: null,
    } satisfies NonNullable<ServerProviderStatus["updateState"]>;
    const succeededState = {
      ...queuedState,
      status: "succeeded",
    } satisfies NonNullable<ServerProviderStatus["updateState"]>;

    expect(isProviderUpdateActive(providerStatus("codex", { updateState: queuedState }))).toBe(
      true,
    );
    expect(isProviderUpdateActive(providerStatus("codex", { updateState: succeededState }))).toBe(
      false,
    );
  });
});

describe("withProviderUpdateTimeout", () => {
  it("rejects a provider request that never settles", async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const assertion = expect(
      withProviderUpdateTimeout({
        provider: "opencode",
        request: pending,
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("OpenCode update timed out after 1 second");

    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

});

