import { describe, expect, it } from "vitest";

import {
  isLikelyReadOnlySql,
  probeDatabaseConnection,
  serializeQueryCell,
  toClientConnectionForTest,
} from "./databaseConnections";

// Re-export helper via thin test-only surface: validate pure probe + secret stripping.

describe("probeDatabaseConnection", () => {
  it("requires sqlite file path", async () => {
    const result = await probeDatabaseConnection({ engine: "sqlite" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/file path/i);
  });

  it("requires postgres host", async () => {
    const result = await probeDatabaseConnection({ engine: "postgres" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/host/i);
  });

  it("opens a real sqlite file when bun:sqlite is available", async () => {
    let Database: typeof import("bun:sqlite").Database;
    try {
      ({ Database } = await import("bun:sqlite"));
    } catch {
      // Server unit tests run under Node vitest; the live server runs on Bun.
      return;
    }
    const path = `/tmp/synara-db-probe-${Date.now()}.sqlite`;
    const db = new Database(path);
    db.run("create table t(x integer)");
    db.close();

    const result = await probeDatabaseConnection({ engine: "sqlite", filePath: path });
    expect(result.ok).toBe(true);
  });
});

describe("client connection projection", () => {
  it("never exposes password or secret names", () => {
    const client = toClientConnectionForTest({
      id: "c1",
      projectId: "p1",
      label: "local",
      engine: "postgres",
      host: "localhost",
      passwordSecretName: "db-conn-c1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(client.hasPassword).toBe(true);
    expect(client).not.toHaveProperty("password");
    expect(client).not.toHaveProperty("passwordSecretName");
    expect(JSON.stringify(client)).not.toContain("db-conn");
  });
});

describe("isLikelyReadOnlySql", () => {
  it("accepts select/with/explain", () => {
    expect(isLikelyReadOnlySql("select 1")).toBe(true);
    expect(isLikelyReadOnlySql("  WITH cte AS (SELECT 1) SELECT * FROM cte")).toBe(true);
    expect(isLikelyReadOnlySql("explain analyze select 1")).toBe(true);
  });

  it("rejects writes", () => {
    expect(isLikelyReadOnlySql("delete from notes")).toBe(false);
    expect(isLikelyReadOnlySql("insert into notes values (1)")).toBe(false);
  });
});

describe("serializeQueryCell", () => {
  it("keeps primitives and stringifies complex values", () => {
    expect(serializeQueryCell(null)).toBeNull();
    expect(serializeQueryCell(1)).toBe(1);
    expect(serializeQueryCell("a")).toBe("a");
    expect(serializeQueryCell(true)).toBe(true);
    expect(serializeQueryCell({ x: 1 })).toBe('{"x":1}');
  });
});
