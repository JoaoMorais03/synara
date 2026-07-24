// FILE: gridEdit.logic.ts
// Purpose: Infer when a result grid is safely cell-editable (single table + id PK).
// Layer: Database UI pure logic

export type GridEditTarget = {
  table: string;
  primaryKeyColumn: string;
};

/** Only simple single-table SELECTs that include an `id` column are editable. */
export function resolveGridEditTarget(input: {
  sql: string;
  columns: readonly string[];
}): GridEditTarget | null {
  if (!input.columns.includes("id")) {
    return null;
  }

  const cleaned = input.sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();

  if (!/^\s*select\b/i.test(cleaned)) {
    return null;
  }
  if (/\bjoin\b/i.test(cleaned)) {
    return null;
  }
  // Multiple tables: FROM a, b
  if (/\bfrom\b[\s\S]*,/i.test(cleaned.split(/\bwhere\b/i)[0] ?? cleaned)) {
    return null;
  }

  const match = cleaned.match(
    /\bfrom\s+(?:["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?\.)?["`]?([A-Za-z_][A-Za-z0-9_]*)["`]?/i,
  );
  const table = match?.[2];
  if (!table) {
    return null;
  }

  return { table, primaryKeyColumn: "id" };
}

export type DirtyCell = {
  primaryKey: string | number | boolean;
  column: string;
  value: string | number | boolean | null;
};

export function dirtyKey(primaryKey: string | number | boolean, column: string): string {
  return `${String(primaryKey)}\u0000${column}`;
}

export function parseCellInput(
  raw: string,
  previous: string | number | boolean | null,
): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") {
    return null;
  }
  if (typeof previous === "number") {
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }
  }
  if (typeof previous === "boolean") {
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
  }
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  const asNumber = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return asNumber;
  }
  return raw;
}
