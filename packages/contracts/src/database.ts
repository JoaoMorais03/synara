// FILE: database.ts
// Purpose: Project-scoped database connection contracts for the simple query pane.
// Layer: Shared contracts

import { Schema } from "effect";

import { IsoDateTime, ProjectId, TrimmedNonEmptyString } from "./baseSchemas";

export const DatabaseEngine = Schema.Literals(["postgres", "sqlite"]);
export type DatabaseEngine = typeof DatabaseEngine.Type;

export const DatabaseConnectionId = TrimmedNonEmptyString.pipe(Schema.brand("DatabaseConnectionId"));
export type DatabaseConnectionId = typeof DatabaseConnectionId.Type;

// Client-facing connection metadata. Passwords never leave the server.
export const DatabaseConnection = Schema.Struct({
  id: DatabaseConnectionId,
  projectId: ProjectId,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
  engine: DatabaseEngine,
  host: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(253))),
  port: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(65_535)),
  ),
  database: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  user: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ssl: Schema.optional(Schema.Boolean),
  filePath: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
  readOnly: Schema.optional(Schema.Boolean),
  hasPassword: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type DatabaseConnection = typeof DatabaseConnection.Type;

export const DatabaseListConnectionsInput = Schema.Struct({
  projectId: ProjectId,
});
export type DatabaseListConnectionsInput = typeof DatabaseListConnectionsInput.Type;

export const DatabaseListConnectionsResult = Schema.Struct({
  connections: Schema.Array(DatabaseConnection),
});
export type DatabaseListConnectionsResult = typeof DatabaseListConnectionsResult.Type;

const ConnectionConfigFields = {
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
  engine: DatabaseEngine,
  host: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(253))),
  port: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(65_535)),
  ),
  database: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  user: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ssl: Schema.optional(Schema.Boolean),
  filePath: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
  readOnly: Schema.optional(Schema.Boolean),
  // Plain password only on write/test paths; never returned by list/upsert responses.
  password: Schema.optional(Schema.String.check(Schema.isMaxLength(1024))),
  clearPassword: Schema.optional(Schema.Boolean),
} as const;

export const DatabaseUpsertConnectionInput = Schema.Struct({
  projectId: ProjectId,
  id: Schema.optional(DatabaseConnectionId),
  ...ConnectionConfigFields,
});
export type DatabaseUpsertConnectionInput = typeof DatabaseUpsertConnectionInput.Type;

export const DatabaseDeleteConnectionInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DatabaseConnectionId,
});
export type DatabaseDeleteConnectionInput = typeof DatabaseDeleteConnectionInput.Type;

// Test either a saved connection (connectionId) and/or a draft form payload.
export const DatabaseTestConnectionInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: Schema.optional(DatabaseConnectionId),
  engine: Schema.optional(DatabaseEngine),
  host: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(253))),
  port: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(65_535)),
  ),
  database: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  user: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ssl: Schema.optional(Schema.Boolean),
  filePath: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(1024))),
  password: Schema.optional(Schema.String.check(Schema.isMaxLength(1024))),
});
export type DatabaseTestConnectionInput = typeof DatabaseTestConnectionInput.Type;

export const DatabaseTestConnectionResult = Schema.Struct({
  ok: Schema.Boolean,
  message: Schema.optional(Schema.String),
});
export type DatabaseTestConnectionResult = typeof DatabaseTestConnectionResult.Type;

export const DATABASE_QUERY_DEFAULT_ROW_LIMIT = 200;
export const DATABASE_QUERY_MAX_ROW_LIMIT = 1000;
export const DATABASE_QUERY_MAX_SQL_CHARS = 100_000;

export const DatabaseQueryInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DatabaseConnectionId,
  sql: Schema.String.check(Schema.isNonEmpty()).check(
    Schema.isMaxLength(DATABASE_QUERY_MAX_SQL_CHARS),
  ),
  rowLimit: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(
      Schema.isLessThanOrEqualTo(DATABASE_QUERY_MAX_ROW_LIMIT),
    ),
  ),
});
export type DatabaseQueryInput = typeof DatabaseQueryInput.Type;

// Cells are JSON-safe primitives (or stringified fallbacks for complex values).
export const DatabaseQueryCell = Schema.NullOr(
  Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
);
export type DatabaseQueryCell = typeof DatabaseQueryCell.Type;

export const DatabaseQueryResult = Schema.Struct({
  columns: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Array(DatabaseQueryCell)),
  rowCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  truncated: Schema.Boolean,
  durationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  // Non-SELECT statements may return affected row counts instead of a grid.
  command: Schema.optional(Schema.String),
  affectedRows: Schema.optional(Schema.NullOr(Schema.Int)),
});
export type DatabaseQueryResult = typeof DatabaseQueryResult.Type;

const SqlIdentifier = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)).check(
  Schema.isMaxLength(64),
);

export const DatabaseCellEdit = Schema.Struct({
  primaryKey: DatabaseQueryCell,
  column: SqlIdentifier,
  value: DatabaseQueryCell,
});
export type DatabaseCellEdit = typeof DatabaseCellEdit.Type;

export const DatabaseApplyCellEditsInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DatabaseConnectionId,
  table: SqlIdentifier,
  primaryKeyColumn: Schema.optional(SqlIdentifier).pipe(Schema.withDecodingDefault(() => "id")),
  edits: Schema.Array(DatabaseCellEdit)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(200)),
});
export type DatabaseApplyCellEditsInput = typeof DatabaseApplyCellEditsInput.Type;

export const DatabaseApplyCellEditsResult = Schema.Struct({
  applied: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type DatabaseApplyCellEditsResult = typeof DatabaseApplyCellEditsResult.Type;

export const DatabaseInspectSchemaInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DatabaseConnectionId,
});
export type DatabaseInspectSchemaInput = typeof DatabaseInspectSchemaInput.Type;

export const DatabaseSchemaColumn = Schema.Struct({
  name: TrimmedNonEmptyString,
  dataType: TrimmedNonEmptyString,
  nullable: Schema.Boolean,
  isPrimaryKey: Schema.Boolean,
});
export type DatabaseSchemaColumn = typeof DatabaseSchemaColumn.Type;

export const DatabaseSchemaTable = Schema.Struct({
  name: TrimmedNonEmptyString,
  columns: Schema.Array(DatabaseSchemaColumn),
});
export type DatabaseSchemaTable = typeof DatabaseSchemaTable.Type;

export const DatabaseSchemaNamespace = Schema.Struct({
  name: TrimmedNonEmptyString,
  tables: Schema.Array(DatabaseSchemaTable),
});
export type DatabaseSchemaNamespace = typeof DatabaseSchemaNamespace.Type;

export const DatabaseInspectSchemaResult = Schema.Struct({
  engine: DatabaseEngine,
  namespaces: Schema.Array(DatabaseSchemaNamespace),
});
export type DatabaseInspectSchemaResult = typeof DatabaseInspectSchemaResult.Type;
