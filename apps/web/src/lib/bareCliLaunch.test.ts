import { describe, expect, it } from "vitest";
import type { ServerProviderStatus } from "@synara/contracts";

import {
  interactiveCliCommandForProvider,
  listUsableBareCliProviders,
} from "./bareCliLaunch";

function status(
  provider: ServerProviderStatus["provider"],
  available: boolean,
): ServerProviderStatus {
  return {
    provider,
    available,
    status: available ? "ready" : "error",
    authStatus: available ? "authenticated" : "unknown",
    checkedAt: new Date().toISOString(),
  };
}

describe("bareCliLaunch", () => {
  it("maps providers to interactive CLI commands", () => {
    expect(interactiveCliCommandForProvider("claudeAgent")).toBe("claude");
    expect(interactiveCliCommandForProvider("codex")).toBe("codex");
    expect(interactiveCliCommandForProvider("cursor")).toBe("cursor-agent");
    expect(interactiveCliCommandForProvider("grok")).toBe("grok");
    expect(interactiveCliCommandForProvider("opencode")).toBe("opencode");
  });

  it("lists favorite first and fills up to 3 including unavailable CLIs", () => {
    const providers = listUsableBareCliProviders({
      favoriteProvider: "grok",
      statuses: [
        status("claudeAgent", true),
        status("codex", true),
        status("grok", false),
        status("cursor", false),
        status("opencode", true),
      ],
    });
    expect(providers[0]).toBe("grok");
    expect(providers).toEqual(["grok", "claudeAgent", "codex"]);
    expect(providers).toHaveLength(3);
  });
});
