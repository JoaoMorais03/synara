import { describe, expect, it } from "vitest";

import type { DatabaseQueryResult } from "@synara/contracts";

import { resultsToMarkdown, resultsToTsv } from "./DatabaseQuerySurface";

const sample: DatabaseQueryResult = {
  columns: ["id", "title"],
  rows: [
    [1, "hello"],
    [2, "synara"],
  ],
  rowCount: 2,
  truncated: false,
  durationMs: 3,
};

describe("database result formatters", () => {
  it("formats TSV for prompt paste", () => {
    expect(resultsToTsv(sample)).toBe("id\ttitle\n1\thello\n2\tsynara");
  });

  it("formats markdown tables", () => {
    expect(resultsToMarkdown(sample)).toContain("| id | title |");
    expect(resultsToMarkdown(sample)).toContain("| 1 | hello |");
  });
});
