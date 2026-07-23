// FILE: providerModelOptions.test.ts
// Purpose: Verifies provider-aware model-name formatting for picker and composer labels.
// Layer: Web unit tests
// Depends on: providerModelOptions shared formatting helpers.

import { describe, expect, it } from "vitest";

import {
  buildModelSelection,
  buildNextProviderOptions,
  buildProviderOptionPatch,
  formatProviderModelOptionName,
  groupProviderModelOptions,
  groupProviderModelOptionsWithFavorites,
  mergeDynamicModelOptions,
  providerModelCostMultiplierLabel,
  resolveModelGroupDefaultOpen,
  shouldUseCollapsibleModelGroups,
  type ProviderModelOption,
} from "./providerModelOptions";


describe("formatProviderModelOptionName", () => {
  it("humanizes unknown OpenCode runtime model slugs using the model identifier", () => {
    expect(
      formatProviderModelOptionName({
        provider: "opencode",
        slug: "opencode-go/kimi-k2.6",
      }),
    ).toBe("Kimi K2.6");
  });

  it("keeps known OpenCode-backed models on their shared display names", () => {
    expect(
      formatProviderModelOptionName({
        provider: "opencode",
        slug: "openai/gpt-5",
      }),
    ).toBe("GPT-5");
  });

  it("leaves non-OpenCode unknown slugs unchanged", () => {
    expect(
      formatProviderModelOptionName({
        provider: "codex",
        slug: "custom/internal-model",
      }),
    ).toBe("custom/internal-model");
  });
});

describe("mergeDynamicModelOptions", () => {





  it("deduplicates Cursor transport variants by their base model", () => {
    expect(
      mergeDynamicModelOptions({
        provider: "cursor",
        staticOptions: [
          {
            slug: "grok-4.5[thinking=true]",
            name: "Cursor Grok 4.5",
            isCustom: true,
          },
        ],
        dynamicModels: [
          {
            slug: "grok-4.5",
            name: "Cursor Grok 4.5",
            upstreamProviderId: "xai",
            upstreamProviderName: "xAI",
          },
          { slug: "grok-4.5[thinking=true]", name: "Cursor Grok 4.5" },
        ],
      }),
    ).toEqual([
      {
        slug: "grok-4.5",
        name: "Cursor Grok 4.5",
        upstreamProviderId: "xai",
        upstreamProviderName: "xAI",
      },
    ]);
  });
});

describe("providerModelCostMultiplierLabel", () => {
  it("formats live provider multipliers without hardcoding their values", () => {
    expect(providerModelCostMultiplierLabel("0.38x Factory token rate")).toBe("0.38×");
    expect(providerModelCostMultiplierLabel("12x Factory token rate")).toBe("12×");
  });

  it("ignores descriptions that do not begin with a multiplier", () => {
    expect(providerModelCostMultiplierLabel("Launch Pricing")).toBeNull();
    expect(providerModelCostMultiplierLabel()).toBeNull();
  });
});


describe("groupProviderModelOptions", () => {
  it("groups provider models by upstream provider", () => {
    const options = [
      {
        slug: "anthropic/claude-sonnet",
        name: "Claude Sonnet",
        upstreamProviderId: "anthropic",
        upstreamProviderName: "Anthropic",
      },
      {
        slug: "openai/gpt-5",
        name: "GPT-5",
        upstreamProviderId: "openai",
        upstreamProviderName: "OpenAI",
      },
    ] satisfies ProviderModelOption[];

    const groupedOptions = groupProviderModelOptions(options);

    expect(groupedOptions.map((group) => group.label)).toEqual(["Anthropic", "OpenAI"]);
  });
});

describe("groupProviderModelOptionsWithFavorites", () => {
  it("adds a favourites group ahead of the normal provider groups", () => {
    const options = [
      {
        slug: "anthropic/claude-sonnet",
        name: "Claude Sonnet",
        upstreamProviderId: "anthropic",
        upstreamProviderName: "Anthropic",
      },
      {
        slug: "openai/gpt-5",
        name: "GPT-5",
        upstreamProviderId: "openai",
        upstreamProviderName: "OpenAI",
      },
    ] satisfies ProviderModelOption[];

    const groupedOptions = groupProviderModelOptionsWithFavorites({
      options,
      favoriteSlugs: new Set(["openai/gpt-5"]),
    });

    expect(groupedOptions.map((group) => group.label)).toEqual(["Favourites", "Anthropic"]);
    expect(groupedOptions[0]?.options.map((option) => option.slug)).toEqual(["openai/gpt-5"]);
    expect(groupedOptions.flatMap((group) => group.options.map((option) => option.slug))).toEqual([
      "openai/gpt-5",
      "anthropic/claude-sonnet",
    ]);
  });
});

describe("collapsible model group helpers", () => {
  it("enables collapsible sections only for long grouped lists while not searching", () => {
    expect(shouldUseCollapsibleModelGroups(2, false)).toBe(false);
    expect(shouldUseCollapsibleModelGroups(3, false)).toBe(true);
    expect(shouldUseCollapsibleModelGroups(4, true)).toBe(false);
  });

  it("keeps favourites and the active model group expanded by default", () => {
    expect(
      resolveModelGroupDefaultOpen({
        groupKey: "__favorites__",
        options: [{ slug: "openai/gpt-5", name: "GPT-5" }],
        activeModel: "anthropic/claude-sonnet",
        groupCount: 4,
      }),
    ).toBe(true);
    expect(
      resolveModelGroupDefaultOpen({
        groupKey: "openai",
        options: [{ slug: "openai/gpt-5", name: "GPT-5" }],
        activeModel: "openai/gpt-5",
        groupCount: 4,
      }),
    ).toBe(true);
    expect(
      resolveModelGroupDefaultOpen({
        groupKey: "anthropic",
        options: [{ slug: "anthropic/claude-sonnet", name: "Claude Sonnet" }],
        activeModel: "openai/gpt-5",
        groupCount: 4,
      }),
    ).toBe(false);
  });
});
