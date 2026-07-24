import { describe, expect, it } from "vitest";

import {
  applyCompletion,
  getWordRangeAt,
  highlightSqlToHtml,
  suggestSqlCompletions,
} from "./sqlEditor.logic";

describe("highlightSqlToHtml", () => {
  it("marks keywords and strings", () => {
    const html = highlightSqlToHtml("select 'hi' from notes");
    expect(html).toContain('class="sql-keyword"');
    expect(html).toContain('class="sql-string"');
    expect(html).toContain("select");
  });
});

describe("suggestSqlCompletions", () => {
  it("suggests keywords from prefix", () => {
    const sql = "sel";
    const suggestions = suggestSqlCompletions({ sql, caret: sql.length });
    expect(suggestions.map((item) => item.toLowerCase())).toContain("select");
  });

  it("includes extra words like table names", () => {
    const sql = "no";
    const suggestions = suggestSqlCompletions({
      sql,
      caret: sql.length,
      extraWords: ["notes"],
    });
    expect(suggestions).toContain("notes");
  });
});

describe("applyCompletion", () => {
  it("replaces the current word", () => {
    const sql = "sel";
    const next = applyCompletion({ sql, caret: 3, completion: "select" });
    expect(next.sql).toBe("select");
    expect(next.caret).toBe(6);
  });

  it("finds word range under caret", () => {
    expect(getWordRangeAt("select foo", 8)).toEqual({ start: 7, end: 10, word: "foo" });
  });
});

describe("measureTextareaCaretOffset", () => {
  it("is exported for caret-anchored menus", async () => {
    const { measureTextareaCaretOffset } = await import("./sqlEditor.logic");
    expect(typeof measureTextareaCaretOffset).toBe("function");
  });
});
