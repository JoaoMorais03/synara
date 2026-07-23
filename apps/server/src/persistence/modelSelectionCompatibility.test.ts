// FILE: modelSelectionCompatibility.test.ts
// Purpose: Protects provider inference and option normalization for persisted model selections.
// Layer: Persistence compatibility tests
// Depends on: modelSelectionCompatibility.

import { assert, it } from "@effect/vitest";

import { normalizePersistedModelSelection } from "./modelSelectionCompatibility.ts";

it("preserves canonical OpenCode model selections", () => {
  assert.deepEqual(normalizePersistedModelSelection({ provider: "opencode", model: "openai/gpt-5.5" }), {
    provider: "opencode",
    model: "openai/gpt-5.5",
  });
});

it("infers OpenCode from persisted instance labels", () => {
  assert.deepEqual(
    normalizePersistedModelSelection({
      instanceId: "local-opencode-runtime-instance",
      model: "openai/gpt-5.5",
    }),
    {
      provider: "opencode",
      model: "openai/gpt-5.5",
    },
  );
});

it("normalizes legacy option rows", () => {
  assert.deepEqual(normalizePersistedModelSelection({
    provider: "codex",
    model: "gpt-5.5",
    options: [{ id: "reasoningEffort", value: "high" }],
  }), {
    provider: "codex",
    model: "gpt-5.5",
    options: { reasoningEffort: "high" },
  });
});

it("does not steal ambiguous provider-less Claude slugs from Claude Agent", () => {
  assert.deepEqual(normalizePersistedModelSelection({ model: "claude-opus-4-8" }), {
    provider: "claudeAgent",
    model: "claude-opus-4-8",
  });
});
