import { describe, expect, it } from "vitest";

import { dirtyKey, parseCellInput, resolveGridEditTarget } from "./gridEdit.logic";

describe("resolveGridEditTarget", () => {
  it("accepts simple select with id", () => {
    expect(
      resolveGridEditTarget({
        sql: "select id, title, body from notes order by id",
        columns: ["id", "title", "body"],
      }),
    ).toEqual({ table: "notes", primaryKeyColumn: "id" });
  });

  it("rejects joins and missing id", () => {
    expect(
      resolveGridEditTarget({
        sql: "select a.id, b.name from a join b on a.id = b.a_id",
        columns: ["id", "name"],
      }),
    ).toBeNull();
    expect(
      resolveGridEditTarget({
        sql: "select title from notes",
        columns: ["title"],
      }),
    ).toBeNull();
  });
});

describe("parseCellInput", () => {
  it("keeps numbers when previous was numeric", () => {
    expect(parseCellInput("42", 1)).toBe(42);
    expect(parseCellInput("null", "x")).toBeNull();
  });
});

describe("dirtyKey", () => {
  it("joins pk and column", () => {
    expect(dirtyKey(1, "title")).toBe("1\u0000title");
  });
});
