// FILE: databaseConnections.ts
// Purpose: Persist project database connections (metadata JSON + secret files) and test them.
// Layer: Server database feature
// Note: Passwords live only under secretsDir; list/upsert responses never include them.

import { randomUUID } from "node:crypto";

import type {
  DatabaseApplyCellEditsInput,
  DatabaseApplyCellEditsResult,
  DatabaseConnection,
  DatabaseConnectionId,
  DatabaseDeleteConnectionInput,
  DatabaseEngine,
  DatabaseInspectSchemaInput,
  DatabaseInspectSchemaResult,
  DatabaseListConnectionsResult,
  DatabaseQueryCell,
  DatabaseQueryInput,
  DatabaseQueryResult,
  DatabaseSchemaNamespace,
  DatabaseTestConnectionInput,
  DatabaseTestConnectionResult,
  DatabaseUpsertConnectionInput,
  ProjectId,
} from "@synara/contracts";
import {
  DATABASE_QUERY_DEFAULT_ROW_LIMIT,
  DATABASE_QUERY_MAX_ROW_LIMIT,
} from "@synara/contracts";
import { Effect, FileSystem, Path } from "effect";

import { writeFileStringAtomically } from "../atomicWrite";
import { ServerConfig } from "../config";

type StoredConnection = {
  id: string;
  projectId: string;
  label: string;
  engine: DatabaseEngine;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  ssl?: boolean;
  filePath?: string;
  readOnly?: boolean;
  passwordSecretName?: string;
  createdAt: string;
  updatedAt: string;
};

type StoreFile = {
  connections: StoredConnection[];
};

const STORE_FILE_NAME = "database-connections.json";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function nowIso(): string {
  return new Date().toISOString();
}

function secretNameFor(connectionId: string): string {
  return `db-conn-${connectionId}`;
}

function toClientConnection(stored: StoredConnection): DatabaseConnection {
  return {
    id: stored.id as DatabaseConnectionId,
    projectId: stored.projectId as ProjectId,
    label: stored.label,
    engine: stored.engine,
    ...(stored.host !== undefined ? { host: stored.host } : {}),
    ...(stored.port !== undefined ? { port: stored.port } : {}),
    ...(stored.database !== undefined ? { database: stored.database } : {}),
    ...(stored.user !== undefined ? { user: stored.user } : {}),
    ...(stored.ssl !== undefined ? { ssl: stored.ssl } : {}),
    ...(stored.filePath !== undefined ? { filePath: stored.filePath } : {}),
    ...(stored.readOnly !== undefined ? { readOnly: stored.readOnly } : {}),
    hasPassword: Boolean(stored.passwordSecretName),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/** Test-only export so unit tests can assert password fields never leak. */
export function toClientConnectionForTest(stored: StoredConnection): DatabaseConnection {
  return toClientConnection(stored);
}

function validateConnectionShape(input: {
  engine: DatabaseEngine;
  host?: string | undefined;
  filePath?: string | undefined;
}): string | null {
  if (input.engine === "sqlite") {
    if (!input.filePath?.trim()) {
      return "SQLite connections require a file path.";
    }
    return null;
  }
  if (!input.host?.trim()) {
    return "Postgres connections require a host.";
  }
  return null;
}

function buildPostgresUrl(input: {
  host: string;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  ssl?: boolean | undefined;
}): string {
  const user = encodeURIComponent(input.user ?? "");
  const password = input.password !== undefined ? encodeURIComponent(input.password) : "";
  const auth =
    user.length > 0 ? `${user}${password.length > 0 ? `:${password}` : ""}@` : password ? `:${password}@` : "";
  const port = input.port ?? 5432;
  const database = encodeURIComponent(input.database ?? "postgres");
  const sslMode = input.ssl ? "require" : "disable";
  return `postgres://${auth}${input.host}:${port}/${database}?sslmode=${sslMode}`;
}

/** True when SQL is likely a read (SELECT/WITH/…). Used for readOnly connections. */
export function isLikelyReadOnlySql(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
  const first = stripped.split(/\s+/)[0]?.toLowerCase() ?? "";
  return (
    first === "select" ||
    first === "with" ||
    first === "show" ||
    first === "explain" ||
    first === "pragma" ||
    first === "describe" ||
    first === "desc"
  );
}

export function serializeQueryCell(value: unknown): DatabaseQueryCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return String(value);
    }
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Uint8Array) {
    return `<bytes ${value.byteLength}>`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampRowLimit(rowLimit: number | undefined): number {
  const requested = rowLimit ?? DATABASE_QUERY_DEFAULT_ROW_LIMIT;
  return Math.min(Math.max(1, requested), DATABASE_QUERY_MAX_ROW_LIMIT);
}

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertSafeSqlIdentifier(value: string, label: string): string {
  if (!SAFE_SQL_IDENTIFIER.test(value) || value.length > 64) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function quoteIdent(value: string): string {
  return `"${assertSafeSqlIdentifier(value, "identifier").replaceAll('"', "")}"`;
}

export async function inspectDatabaseSchema(input: {
  engine: DatabaseEngine;
  host?: string | undefined;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  ssl?: boolean | undefined;
  filePath?: string | undefined;
}): Promise<DatabaseInspectSchemaResult> {
  const shapeError = validateConnectionShape(input);
  if (shapeError) {
    throw new Error(shapeError);
  }

  if (input.engine === "sqlite") {
    const { Database } = await import("bun:sqlite");
    const db = new Database(input.filePath!.trim(), { readonly: true, create: false });
    try {
      const tables = db
        .query(
          `select name from sqlite_master
           where type = 'table' and name not like 'sqlite_%'
           order by name`,
        )
        .all() as Array<{ name: string }>;
      const tableNodes = tables.map((table) => {
        const columns = db.query(`pragma table_info(${quoteIdent(table.name)})`).all() as Array<{
          name: string;
          type: string;
          notnull: number;
          pk: number;
        }>;
        return {
          name: table.name,
          columns: columns.map((column) => ({
            name: column.name,
            dataType: (column.type || "any").toLowerCase(),
            nullable: column.notnull === 0,
            isPrimaryKey: column.pk > 0,
          })),
        };
      });
      return {
        engine: "sqlite",
        namespaces: [{ name: "main", tables: tableNodes }],
      };
    } finally {
      db.close();
    }
  }

  const url = buildPostgresUrl({
    host: input.host!.trim(),
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: input.ssl,
  });
  const sql = new Bun.SQL(url, { connectionTimeout: 15, max: 1, idleTimeout: 15 });
  try {
    const rows = (await sql.unsafe(`
      select
        c.table_schema as schema_name,
        c.table_name as table_name,
        c.column_name as column_name,
        c.data_type as data_type,
        c.is_nullable as is_nullable,
        case when tc.constraint_type = 'PRIMARY KEY' then true else false end as is_primary_key
      from information_schema.columns c
      left join information_schema.key_column_usage kcu
        on c.table_schema = kcu.table_schema
        and c.table_name = kcu.table_name
        and c.column_name = kcu.column_name
      left join information_schema.table_constraints tc
        on kcu.constraint_name = tc.constraint_name
        and kcu.table_schema = tc.table_schema
        and kcu.table_name = tc.table_name
        and tc.constraint_type = 'PRIMARY KEY'
      where c.table_schema not in ('pg_catalog', 'information_schema')
      order by c.table_schema, c.table_name, c.ordinal_position
    `)) as Array<Record<string, unknown>>;

    const bySchema = new Map<string, Map<string, DatabaseSchemaNamespace["tables"][number]>>();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || typeof row !== "object") continue;
      const schemaName = String(row.schema_name ?? "public");
      const tableName = String(row.table_name ?? "");
      const columnName = String(row.column_name ?? "");
      if (!tableName || !columnName) continue;
      let tables = bySchema.get(schemaName);
      if (!tables) {
        tables = new Map();
        bySchema.set(schemaName, tables);
      }
      let table = tables.get(tableName);
      if (!table) {
        table = { name: tableName, columns: [] };
        tables.set(tableName, table);
      }
      table.columns.push({
        name: columnName,
        dataType: String(row.data_type ?? "unknown"),
        nullable: String(row.is_nullable).toUpperCase() === "YES",
        isPrimaryKey: Boolean(row.is_primary_key),
      });
    }

    const namespaces: DatabaseSchemaNamespace[] = [...bySchema.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, tables]) => ({
        name,
        tables: [...tables.values()].sort((left, right) => left.name.localeCompare(right.name)),
      }));

    return { engine: "postgres", namespaces };
  } finally {
    await sql.close();
  }
}

export async function applyDatabaseCellEdits(input: {
  engine: DatabaseEngine;
  host?: string | undefined;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  ssl?: boolean | undefined;
  filePath?: string | undefined;
  readOnly?: boolean | undefined;
  table: string;
  primaryKeyColumn: string;
  edits: ReadonlyArray<{
    primaryKey: DatabaseQueryCell;
    column: string;
    value: DatabaseQueryCell;
  }>;
}): Promise<DatabaseApplyCellEditsResult> {
  if (input.readOnly) {
    throw new Error("Connection is read-only.");
  }
  if (input.edits.length === 0) {
    return { applied: 0 };
  }
  const shapeError = validateConnectionShape(input);
  if (shapeError) {
    throw new Error(shapeError);
  }

  const table = assertSafeSqlIdentifier(input.table, "table");
  const pkColumn = assertSafeSqlIdentifier(input.primaryKeyColumn, "primary key column");
  for (const edit of input.edits) {
    assertSafeSqlIdentifier(edit.column, "column");
    if (edit.column === pkColumn) {
      throw new Error("Cannot edit the primary key column.");
    }
    if (edit.primaryKey === null || edit.primaryKey === undefined) {
      throw new Error("Primary key value is required.");
    }
  }

  if (input.engine === "sqlite") {
    const { Database } = await import("bun:sqlite");
    const db = new Database(input.filePath!.trim(), { readonly: false, create: false });
    try {
      const tx = db.transaction(() => {
        let applied = 0;
        for (const edit of input.edits) {
          const sql = `UPDATE ${quoteIdent(table)} SET ${quoteIdent(edit.column)} = ? WHERE ${quoteIdent(pkColumn)} = ?`;
          const result = db.query(sql).run(edit.value, edit.primaryKey);
          applied += Number(result.changes ?? 0);
        }
        return applied;
      });
      return { applied: tx() };
    } finally {
      db.close();
    }
  }

  const url = buildPostgresUrl({
    host: input.host!.trim(),
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: input.ssl,
  });
  const sql = new Bun.SQL(url, { connectionTimeout: 15, max: 1, idleTimeout: 15 });
  try {
    let applied = 0;
    await sql.begin(async (tx) => {
      for (const edit of input.edits) {
        const statement = `UPDATE ${quoteIdent(table)} SET ${quoteIdent(edit.column)} = $1 WHERE ${quoteIdent(pkColumn)} = $2`;
        const result = await tx.unsafe(statement, [edit.value, edit.primaryKey]);
        const affected = (result as { affectedRows?: unknown }).affectedRows;
        if (typeof affected === "number" && Number.isFinite(affected)) {
          applied += affected;
        } else {
          applied += 1;
        }
      }
    });
    return { applied };
  } finally {
    await sql.close();
  }
}

export async function executeDatabaseQuery(input: {
  engine: DatabaseEngine;
  host?: string | undefined;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  ssl?: boolean | undefined;
  filePath?: string | undefined;
  readOnly?: boolean | undefined;
  sql: string;
  rowLimit?: number | undefined;
}): Promise<DatabaseQueryResult> {
  const sqlText = input.sql.trim();
  if (!sqlText) {
    throw new Error("SQL is required.");
  }
  if (input.readOnly && !isLikelyReadOnlySql(sqlText)) {
    throw new Error("Connection is read-only; only SELECT/WITH/EXPLAIN-style queries are allowed.");
  }
  const shapeError = validateConnectionShape(input);
  if (shapeError) {
    throw new Error(shapeError);
  }

  const rowLimit = clampRowLimit(input.rowLimit);
  const started = Date.now();

  if (input.engine === "sqlite") {
    const filePath = input.filePath!.trim();
    const { Database } = await import("bun:sqlite");
    const db = new Database(filePath, {
      readonly: Boolean(input.readOnly),
      create: false,
    });
    try {
      const statement = db.query(sqlText);
      const rawRows = statement.all() as Array<Record<string, unknown>>;
      const truncated = rawRows.length > rowLimit;
      const limited = truncated ? rawRows.slice(0, rowLimit) : rawRows;
      const columns =
        limited.length > 0
          ? Object.keys(limited[0]!)
          : ((statement as { columnNames?: string[] }).columnNames ?? []);
      const rows = limited.map((row) => columns.map((column) => serializeQueryCell(row[column])));
      return {
        columns,
        rows,
        rowCount: rows.length,
        truncated,
        durationMs: Date.now() - started,
        command: isLikelyReadOnlySql(sqlText) ? "SELECT" : "QUERY",
        affectedRows: null,
      };
    } finally {
      db.close();
    }
  }

  const url = buildPostgresUrl({
    host: input.host!.trim(),
    port: input.port,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl: input.ssl,
  });
  const sql = new Bun.SQL(url, { connectionTimeout: 15, max: 1, idleTimeout: 15 });
  try {
    const result = await sql.unsafe(sqlText);
    const command =
      typeof (result as { command?: unknown }).command === "string"
        ? (result as { command: string }).command
        : undefined;
    const affectedRowsRaw = (result as { affectedRows?: unknown }).affectedRows;
    const affectedRows =
      typeof affectedRowsRaw === "number" && Number.isFinite(affectedRowsRaw)
        ? affectedRowsRaw
        : null;

    const arrayRows = Array.isArray(result)
      ? (result as Array<Record<string, unknown>>)
      : [];
    // Bun.SQL attaches metadata props on the array; only object rows count.
    const objectRows = arrayRows.filter(
      (row) => row !== null && typeof row === "object" && !Array.isArray(row),
    );
    const truncated = objectRows.length > rowLimit;
    const limited = truncated ? objectRows.slice(0, rowLimit) : objectRows;
    const columns = limited.length > 0 ? Object.keys(limited[0]!) : [];
    const rows = limited.map((row) => columns.map((column) => serializeQueryCell(row[column])));

    return {
      columns,
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Date.now() - started,
      ...(command !== undefined ? { command } : {}),
      affectedRows,
    };
  } finally {
    await sql.close();
  }
}

export async function probeDatabaseConnection(input: {
  engine: DatabaseEngine;
  host?: string | undefined;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  ssl?: boolean | undefined;
  filePath?: string | undefined;
}): Promise<DatabaseTestConnectionResult> {
  const shapeError = validateConnectionShape(input);
  if (shapeError) {
    return { ok: false, message: shapeError };
  }

  try {
    if (input.engine === "sqlite") {
      const filePath = input.filePath!.trim();
      // Lazy import so Node-based vitest can load this module without bun builtins.
      const { Database } = await import("bun:sqlite");
      const db = new Database(filePath, { readonly: true, create: false });
      try {
        db.query("select 1").get();
      } finally {
        db.close();
      }
      return { ok: true, message: "Connected." };
    }

    const url = buildPostgresUrl({
      host: input.host!.trim(),
      port: input.port,
      database: input.database,
      user: input.user,
      password: input.password,
      ssl: input.ssl,
    });
    const sql = new Bun.SQL(url, { connectionTimeout: 5, max: 1 });
    try {
      await sql`select 1`;
    } finally {
      await sql.close();
    }
    return { ok: true, message: "Connected." };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : "Connection failed.";
    return { ok: false, message };
  }
}

const makeDatabaseConnectionStore = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const storePath = path.join(config.stateDir, STORE_FILE_NAME);
  const secretsDir = config.secretsDir;

  const secretPath = (name: string) => path.join(secretsDir, `${name.replace(/[^a-zA-Z0-9_.-]/g, "_")}.bin`);

  const readStore = Effect.gen(function* () {
    const exists = yield* fileSystem.exists(storePath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return { connections: [] } satisfies StoreFile;
    }
    const raw = yield* fileSystem.readFileString(storePath);
    try {
      const parsed = JSON.parse(raw) as StoreFile;
      if (!parsed || !Array.isArray(parsed.connections)) {
        return { connections: [] } satisfies StoreFile;
      }
      return parsed;
    } catch {
      return { connections: [] } satisfies StoreFile;
    }
  });

  const writeStore = (store: StoreFile) =>
    writeFileStringAtomically({
      filePath: storePath,
      contents: `${JSON.stringify(store, null, 2)}\n`,
      mode: 0o600,
    });

  const readPassword = (secretName: string | undefined) =>
    Effect.gen(function* () {
      if (!secretName) {
        return undefined as string | undefined;
      }
      const file = secretPath(secretName);
      const exists = yield* fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return undefined;
      }
      const bytes = yield* fileSystem.readFile(file);
      return textDecoder.decode(bytes);
    });

  const writePassword = (secretName: string, password: string) =>
    writeFileStringAtomically({
      filePath: secretPath(secretName),
      contents: textEncoder.encode(password),
      mode: 0o600,
    });

  const removePassword = (secretName: string | undefined) =>
    Effect.gen(function* () {
      if (!secretName) {
        return;
      }
      yield* fileSystem.remove(secretPath(secretName), { force: true }).pipe(Effect.orElseSucceed(() => undefined));
    });

  const list = (projectId: ProjectId): Effect.Effect<DatabaseListConnectionsResult> =>
    readStore.pipe(
      Effect.map((store) => ({
        connections: store.connections
          .filter((connection) => connection.projectId === projectId)
          .map(toClientConnection)
          .sort((left, right) => left.label.localeCompare(right.label)),
      })),
    );

  const upsert = (input: DatabaseUpsertConnectionInput): Effect.Effect<DatabaseConnection, Error> =>
    Effect.gen(function* () {
      const shapeError = validateConnectionShape(input);
      if (shapeError) {
        return yield* Effect.fail(new Error(shapeError));
      }

      const store = yield* readStore;
      const existingIndex = input.id
        ? store.connections.findIndex(
            (connection) => connection.id === input.id && connection.projectId === input.projectId,
          )
        : -1;
      const existing = existingIndex >= 0 ? store.connections[existingIndex] : undefined;
      const id = existing?.id ?? input.id ?? randomUUID();
      const timestamp = nowIso();
      let passwordSecretName = existing?.passwordSecretName;

      if (input.clearPassword) {
        yield* removePassword(passwordSecretName);
        passwordSecretName = undefined;
      } else if (input.password !== undefined && input.password.length > 0) {
        const name = passwordSecretName ?? secretNameFor(id);
        yield* fileSystem.makeDirectory(secretsDir, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));
        yield* writePassword(name, input.password);
        passwordSecretName = name;
      }

      const next: StoredConnection = {
        id,
        projectId: input.projectId,
        label: input.label.trim(),
        engine: input.engine,
        ...(input.host !== undefined ? { host: input.host.trim() } : {}),
        ...(input.port !== undefined ? { port: input.port } : {}),
        ...(input.database !== undefined ? { database: input.database.trim() } : {}),
        ...(input.user !== undefined ? { user: input.user.trim() } : {}),
        ...(input.ssl !== undefined ? { ssl: input.ssl } : {}),
        ...(input.filePath !== undefined ? { filePath: input.filePath.trim() } : {}),
        ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
        ...(passwordSecretName !== undefined ? { passwordSecretName } : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      const connections =
        existingIndex >= 0
          ? store.connections.map((connection, index) => (index === existingIndex ? next : connection))
          : [...store.connections, next];
      yield* writeStore({ connections });
      return toClientConnection(next);
    });

  const remove = (input: DatabaseDeleteConnectionInput): Effect.Effect<void, Error> =>
    Effect.gen(function* () {
      const store = yield* readStore;
      const existing = store.connections.find(
        (connection) =>
          connection.id === input.connectionId && connection.projectId === input.projectId,
      );
      if (!existing) {
        return;
      }
      yield* removePassword(existing.passwordSecretName);
      yield* writeStore({
        connections: store.connections.filter((connection) => connection.id !== existing.id),
      });
    });

  const test = (input: DatabaseTestConnectionInput): Effect.Effect<DatabaseTestConnectionResult> =>
    Effect.gen(function* () {
      let engine = input.engine;
      let host = input.host;
      let port = input.port;
      let database = input.database;
      let user = input.user;
      let ssl = input.ssl;
      let filePath = input.filePath;
      let password = input.password;

      if (input.connectionId) {
        const store = yield* readStore;
        const existing = store.connections.find(
          (connection) =>
            connection.id === input.connectionId && connection.projectId === input.projectId,
        );
        if (!existing) {
          return { ok: false, message: "Connection not found." };
        }
        engine = engine ?? existing.engine;
        host = host ?? existing.host;
        port = port ?? existing.port;
        database = database ?? existing.database;
        user = user ?? existing.user;
        ssl = ssl ?? existing.ssl;
        filePath = filePath ?? existing.filePath;
        if (password === undefined) {
          password = yield* readPassword(existing.passwordSecretName);
        }
      }

      if (!engine) {
        return { ok: false, message: "Engine is required." };
      }

      return yield* Effect.promise(() =>
        probeDatabaseConnection({
          engine,
          host,
          port,
          database,
          user,
          password,
          ssl,
          filePath,
        }),
      );
    });

  const query = (input: DatabaseQueryInput): Effect.Effect<DatabaseQueryResult, Error> =>
    Effect.gen(function* () {
      const store = yield* readStore;
      const existing = store.connections.find(
        (connection) =>
          connection.id === input.connectionId && connection.projectId === input.projectId,
      );
      if (!existing) {
        return yield* Effect.fail(new Error("Connection not found."));
      }
      const password = yield* readPassword(existing.passwordSecretName);
      return yield* Effect.tryPromise({
        try: () =>
          executeDatabaseQuery({
            engine: existing.engine,
            host: existing.host,
            port: existing.port,
            database: existing.database,
            user: existing.user,
            password,
            ssl: existing.ssl,
            filePath: existing.filePath,
            readOnly: existing.readOnly,
            sql: input.sql,
            rowLimit: input.rowLimit,
          }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Failed to run database query."),
      });
    });

  const applyCellEdits = (
    input: DatabaseApplyCellEditsInput,
  ): Effect.Effect<DatabaseApplyCellEditsResult, Error> =>
    Effect.gen(function* () {
      const store = yield* readStore;
      const existing = store.connections.find(
        (connection) =>
          connection.id === input.connectionId && connection.projectId === input.projectId,
      );
      if (!existing) {
        return yield* Effect.fail(new Error("Connection not found."));
      }
      const password = yield* readPassword(existing.passwordSecretName);
      return yield* Effect.tryPromise({
        try: () =>
          applyDatabaseCellEdits({
            engine: existing.engine,
            host: existing.host,
            port: existing.port,
            database: existing.database,
            user: existing.user,
            password,
            ssl: existing.ssl,
            filePath: existing.filePath,
            readOnly: existing.readOnly,
            table: input.table,
            primaryKeyColumn: input.primaryKeyColumn ?? "id",
            edits: input.edits,
          }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Failed to push cell edits."),
      });
    });

  const inspectSchema = (
    input: DatabaseInspectSchemaInput,
  ): Effect.Effect<DatabaseInspectSchemaResult, Error> =>
    Effect.gen(function* () {
      const store = yield* readStore;
      const existing = store.connections.find(
        (connection) =>
          connection.id === input.connectionId && connection.projectId === input.projectId,
      );
      if (!existing) {
        return yield* Effect.fail(new Error("Connection not found."));
      }
      const password = yield* readPassword(existing.passwordSecretName);
      return yield* Effect.tryPromise({
        try: () =>
          inspectDatabaseSchema({
            engine: existing.engine,
            host: existing.host,
            port: existing.port,
            database: existing.database,
            user: existing.user,
            password,
            ssl: existing.ssl,
            filePath: existing.filePath,
          }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Failed to inspect schema."),
      });
    });

  return { list, upsert, remove, test, query, applyCellEdits, inspectSchema };
});

export type DatabaseConnectionStore = Effect.Effect.Success<typeof makeDatabaseConnectionStore>;

export const getDatabaseConnectionStore = makeDatabaseConnectionStore;
