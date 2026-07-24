// FILE: textGenerationShared.test.ts
// Purpose: Verifies shared structured text-generation parsing helpers.
// Layer: Server git utility test
// Depends on: Effect schema decoding.

import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { decodeStructuredTextGenerationOutput } from "./textGenerationShared.ts";

describe("textGenerationShared", () => {
  it("decodes structured JSON output against a schema", async () => {
    const schema = Schema.Struct({
      summary: Schema.String,
      score: Schema.Number,
    });

    const result = await Effect.runPromise(
      decodeStructuredTextGenerationOutput({
        schema,
        raw: JSON.stringify({
          summary: "ok",
          score: 0.8,
        }),
        operation: "decode test",
        providerLabel: "Test provider",
      }),
    );

    expect(result).toEqual({
      summary: "ok",
      score: 0.8,
    });
  });
});
