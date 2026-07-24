// FILE: CursorAdapter.test.ts
// Purpose: Cursor adapter unit coverage. Harness-policy / gateway MCP injection
// was removed; Synara is a CLI harness only.
// Layer: Provider adapter tests

import { describe, expect, it } from "vitest";

describe("CursorAdapter", () => {
  it("does not export Synara gateway harness policy helpers", async () => {
    const mod = await import("./CursorAdapter.ts");
    expect("takeCursorSynaraHarnessPolicyTextPart" in mod).toBe(false);
  });
});
