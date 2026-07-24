// FILE: DatabaseQuerySurface.tsx
// Purpose: Shared project database surface (dock + full page): tabs, SQL editor, grid results.
// Layer: Database UI

import type {
  DatabaseConnection,
  DatabaseEngine,
  DatabaseInspectSchemaResult,
  DatabaseQueryResult,
  DatabaseUpsertConnectionInput,
  ProjectId,
} from "@synara/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { PanelStateMessage } from "~/components/chat/PanelStateMessage";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { DatabaseIcon, PencilIcon, PlusIcon, XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { ensureNativeApi, readNativeApi } from "~/nativeApi";
import {
  dirtyKey,
  parseCellInput,
  resolveGridEditTarget,
  type DirtyCell,
} from "./gridEdit.logic";
import { SchemaTreePanel } from "./SchemaTreePanel";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";

export type DatabaseQuerySurfaceMode = "sidebar" | "page";

type DraftForm = {
  id?: string;
  label: string;
  engine: DatabaseEngine;
  host: string;
  port: string;
  database: string;
  user: string;
  ssl: boolean;
  filePath: string;
  readOnly: boolean;
  password: string;
  clearPassword: boolean;
};

const EMPTY_DRAFT: DraftForm = {
  label: "",
  engine: "postgres",
  host: "localhost",
  port: "5432",
  database: "",
  user: "",
  ssl: false,
  filePath: "",
  readOnly: false,
  password: "",
  clearPassword: false,
};

const LAST_CONNECTION_KEY = "synara:database:last-connection";

function draftFromConnection(connection: DatabaseConnection): DraftForm {
  return {
    id: connection.id,
    label: connection.label,
    engine: connection.engine,
    host: connection.host ?? "localhost",
    port: connection.port !== undefined ? String(connection.port) : "5432",
    database: connection.database ?? "",
    user: connection.user ?? "",
    ssl: connection.ssl ?? false,
    filePath: connection.filePath ?? "",
    readOnly: connection.readOnly ?? false,
    password: "",
    clearPassword: false,
  };
}

function toUpsertInput(projectId: ProjectId, draft: DraftForm): DatabaseUpsertConnectionInput {
  const port = draft.port.trim() ? Number.parseInt(draft.port, 10) : undefined;
  return {
    projectId,
    ...(draft.id ? { id: draft.id as DatabaseUpsertConnectionInput["id"] } : {}),
    label: draft.label.trim() || "connection",
    engine: draft.engine,
    ...(draft.engine === "postgres"
      ? {
          host: draft.host.trim() || "localhost",
          ...(port !== undefined && Number.isFinite(port) ? { port } : {}),
          ...(draft.database.trim() ? { database: draft.database.trim() } : {}),
          ...(draft.user.trim() ? { user: draft.user.trim() } : {}),
          ssl: draft.ssl,
        }
      : {
          filePath: draft.filePath.trim(),
        }),
    readOnly: draft.readOnly,
    ...(draft.clearPassword ? { clearPassword: true } : {}),
    ...(draft.password.length > 0 ? { password: draft.password } : {}),
  };
}

function readLastConnectionId(projectId: ProjectId): string | null {
  try {
    const raw = localStorage.getItem(`${LAST_CONNECTION_KEY}:${projectId}`);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeLastConnectionId(projectId: ProjectId, connectionId: string): void {
  try {
    localStorage.setItem(`${LAST_CONNECTION_KEY}:${projectId}`, connectionId);
  } catch {
    // ignore
  }
}

export function resultsToTsv(result: DatabaseQueryResult): string {
  const escape = (value: string) => {
    if (/[\t\n\r"]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const lines = [
    result.columns.map((column) => escape(column)).join("\t"),
    ...result.rows.map((row) =>
      row.map((cell) => escape(cell === null ? "" : String(cell))).join("\t"),
    ),
  ];
  return lines.join("\n");
}

export function resultsToMarkdown(result: DatabaseQueryResult): string {
  if (result.columns.length === 0) {
    return result.command
      ? `${result.command}${result.affectedRows != null ? ` · ${result.affectedRows} rows affected` : ""}`
      : "_No rows_";
  }
  const header = `| ${result.columns.join(" | ")} |`;
  const sep = `| ${result.columns.map(() => "---").join(" | ")} |`;
  const body = result.rows.map(
    (row) => `| ${row.map((cell) => (cell === null ? "" : String(cell))).join(" | ")} |`,
  );
  return [header, sep, ...body].join("\n");
}

export function DatabaseQuerySurface(props: {
  mode: DatabaseQuerySurfaceMode;
  projectId: ProjectId | null;
  projectName?: string | null;
  className?: string;
}) {
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sql, setSql] = useState("select id, title, body from notes order by id");
  // Last query that successfully produced a result grid — used after Push so we
  // re-fetch the same rows even when the editor still holds multi-statement text
  // and the original run was selection-only.
  const [lastExecutedSql, setLastExecutedSql] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [dirtyByKey, setDirtyByKey] = useState<Record<string, DirtyCell>>({});
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(() => props.mode === "page");
  const [schema, setSchema] = useState<DatabaseInspectSchemaResult | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  // null = pre-query “editor fills the pane”; number = fixed height once results exist.
  const [editorHeightPx, setEditorHeightPx] = useState<number | null>(null);
  const sqlEditorRef = useRef<SqlEditorHandle>(null);
  const workAreaRef = useRef<HTMLDivElement>(null);

  const compact = props.mode === "sidebar";
  const dirtyList = useMemo(() => Object.values(dirtyByKey), [dirtyByKey]);
  const hasResults = queryResult !== null;
  const editorFillsPane = !hasResults;

  const defaultEditorHeight = compact ? 132 : 168;
  const minEditorHeight = compact ? 88 : 112;
  const maxEditorHeight = (containerHeight: number) =>
    Math.max(minEditorHeight, Math.floor(containerHeight * 0.55));

  const refresh = useCallback(async (projectId: ProjectId) => {
    const api = readNativeApi();
    if (!api?.database) {
      setError("Database API unavailable.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.database.listConnections({ projectId });
      const next = [...result.connections];
      setConnections(next);
      setSelectedId((current) => {
        if (current && next.some((connection) => connection.id === current)) {
          return current;
        }
        const remembered = readLastConnectionId(projectId);
        if (remembered && next.some((connection) => connection.id === remembered)) {
          return remembered;
        }
        return next[0]?.id ?? null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load connections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!props.projectId) {
      setConnections([]);
      setDraft(null);
      setSelectedId(null);
      setQueryResult(null);
      setDialogOpen(false);
      return;
    }
    void refresh(props.projectId);
  }, [props.projectId, refresh]);

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId) ?? null,
    [connections, selectedId],
  );

  const editTarget = useMemo(() => {
    if (!queryResult || selected?.readOnly) {
      return null;
    }
    // Match the query that produced this grid (selection-aware), not the full buffer.
    return resolveGridEditTarget({
      sql: lastExecutedSql ?? sql,
      columns: queryResult.columns,
    });
  }, [queryResult, selected?.readOnly, lastExecutedSql, sql]);

  const extraWords = useMemo(() => {
    const words = new Set<string>();
    if (queryResult) {
      for (const column of queryResult.columns) {
        words.add(column);
      }
    }
    if (schema) {
      for (const namespace of schema.namespaces) {
        for (const table of namespace.tables) {
          words.add(table.name);
          for (const column of table.columns) {
            words.add(column.name);
          }
        }
      }
    }
    words.add("notes");
    return [...words];
  }, [queryResult, schema]);

  const loadSchema = useCallback(
    async (connectionId: string) => {
      if (!props.projectId) {
        return;
      }
      const api = readNativeApi();
      if (!api?.database) {
        setSchemaError("Database API unavailable.");
        return;
      }
      setSchemaLoading(true);
      setSchemaError(null);
      try {
        const result = await api.database.inspectSchema({
          projectId: props.projectId,
          connectionId: connectionId as DatabaseConnection["id"],
        });
        setSchema(result);
      } catch (cause) {
        setSchema(null);
        setSchemaError(cause instanceof Error ? cause.message : "Failed to load schema.");
      } finally {
        setSchemaLoading(false);
      }
    },
    [props.projectId],
  );

  const selectConnection = (connectionId: string) => {
    setSelectedId(connectionId);
    setQueryResult(null);
    setLastExecutedSql(null);
    setDirtyByKey({});
    setEditorHeightPx(null); // full-pane editor until next query
    setError(null);
    setSchema(null);
    setSchemaError(null);
    if (props.projectId) {
      writeLastConnectionId(props.projectId, connectionId);
    }
    if (schemaOpen) {
      void loadSchema(connectionId);
    }
  };

  useEffect(() => {
    if (schemaOpen && selectedId) {
      void loadSchema(selectedId);
    }
  }, [schemaOpen, selectedId, loadSchema]);

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT, label: "local" });
    setDialogOpen(true);
  };

  const openEdit = (connection: DatabaseConnection) => {
    setSelectedId(connection.id);
    setDraft(draftFromConnection(connection));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!props.projectId || !draft) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const saved = await api.database.upsertConnection(toUpsertInput(props.projectId, draft));
      await refresh(props.projectId);
      selectConnection(saved.id);
      closeDialog();
      toastManager.add({ type: "success", title: "Connection saved" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (connection: DatabaseConnection) => {
    if (!props.projectId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      await api.database.deleteConnection({
        projectId: props.projectId,
        connectionId: connection.id,
      });
      await refresh(props.projectId);
      setQueryResult(null);
      if (dialogOpen && draft?.id === connection.id) {
        closeDialog();
      }
      toastManager.add({ type: "success", title: "Connection removed" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!props.projectId || !draft) {
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const upsertInput = toUpsertInput(props.projectId, draft);
      const result = await api.database.testConnection({
        projectId: props.projectId,
        ...(draft.id ? { connectionId: draft.id as DatabaseConnection["id"] } : {}),
        engine: upsertInput.engine,
        host: upsertInput.host,
        port: upsertInput.port,
        database: upsertInput.database,
        user: upsertInput.user,
        ssl: upsertInput.ssl,
        filePath: upsertInput.filePath,
        password: upsertInput.password,
      });
      if (result.ok) {
        toastManager.add({ type: "success", title: "Connection OK", description: result.message });
      } else {
        setError(result.message ?? "Connection failed.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to test connection.");
    } finally {
      setTesting(false);
    }
  };

  const handleRun = async (sqlOverride?: string) => {
    if (!props.projectId || !selected) {
      return;
    }
    // Prefer explicit selection from the editor; otherwise run the full buffer.
    const trimmed = (sqlOverride ?? sql).trim();
    if (!trimmed) {
      setError("Enter a SQL statement.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const result = await api.database.query({
        projectId: props.projectId,
        connectionId: selected.id,
        sql: trimmed,
      });
      setQueryResult(result);
      setLastExecutedSql(trimmed);
      setDirtyByKey({});
      // First successful query: collapse editor so the grid owns the pane.
      setEditorHeightPx((current) => current ?? defaultEditorHeight);
      writeLastConnectionId(props.projectId, selected.id);
    } catch (cause) {
      setQueryResult(null);
      setDirtyByKey({});
      setError(cause instanceof Error ? cause.message : "Query failed.");
    } finally {
      setRunning(false);
    }
  };

  const beginEditorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startHeight = editorHeightPx ?? defaultEditorHeight;
    const containerHeight = workAreaRef.current?.clientHeight ?? 480;
    const maxHeight = maxEditorHeight(containerHeight);

    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.min(
        maxHeight,
        Math.max(minEditorHeight, startHeight + (moveEvent.clientY - startY)),
      );
      setEditorHeightPx(next);
    };
    const onUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const displayRows = useMemo(() => {
    if (!queryResult) {
      return [];
    }
    if (!editTarget || dirtyList.length === 0) {
      return queryResult.rows;
    }
    const pkIndex = queryResult.columns.indexOf(editTarget.primaryKeyColumn);
    if (pkIndex < 0) {
      return queryResult.rows;
    }
    return queryResult.rows.map((row) => {
      const pk = row[pkIndex];
      if (pk === null || typeof pk === "boolean") {
        // boolean pk is rare; still allow number/string
      }
      if (pk === null) {
        return row;
      }
      return row.map((cell, cellIndex) => {
        const column = queryResult.columns[cellIndex]!;
        if (column === editTarget.primaryKeyColumn) {
          return cell;
        }
        const key = dirtyKey(pk as string | number | boolean, column);
        const dirty = dirtyByKey[key];
        return dirty ? dirty.value : cell;
      });
    });
  }, [queryResult, editTarget, dirtyList.length, dirtyByKey]);

  const handleCellCommit = (input: {
    primaryKey: string | number | boolean;
    column: string;
    previous: string | number | boolean | null;
    raw: string;
  }) => {
    const nextValue = parseCellInput(input.raw, input.previous);
    const same =
      nextValue === input.previous ||
      (nextValue === null && input.previous === null) ||
      String(nextValue) === String(input.previous);
    const key = dirtyKey(input.primaryKey, input.column);
    setDirtyByKey((current) => {
      if (same) {
        if (!(key in current)) {
          return current;
        }
        const { [key]: _removed, ...rest } = current;
        return rest;
      }
      return {
        ...current,
        [key]: {
          primaryKey: input.primaryKey,
          column: input.column,
          value: nextValue,
        },
      };
    });
  };

  const handlePush = async () => {
    if (!props.projectId || !selected || !editTarget || dirtyList.length === 0) {
      return;
    }
    setPushing(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const result = await api.database.applyCellEdits({
        projectId: props.projectId,
        connectionId: selected.id,
        table: editTarget.table,
        primaryKeyColumn: editTarget.primaryKeyColumn,
        edits: dirtyList.map((edit) => ({
          primaryKey: edit.primaryKey,
          column: edit.column,
          value: edit.value,
        })),
      });
      setDirtyByKey({});
      toastManager.add({
        type: "success",
        title: "Changes pushed",
        description: `${result.applied} row${result.applied === 1 ? "" : "s"} updated`,
      });
      // Re-run the query that produced this grid (may have been a selection),
      // not the whole multi-statement editor buffer.
      if (lastExecutedSql) {
        await handleRun(lastExecutedSql);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to push changes.");
    } finally {
      setPushing(false);
    }
  };

  const handleCopy = async (format: "tsv" | "markdown") => {
    if (!queryResult) {
      return;
    }
    const text = format === "tsv" ? resultsToTsv(queryResult) : resultsToMarkdown(queryResult);
    try {
      await copyTextToClipboard(text);
      toastManager.add({ type: "success", title: `Copied ${format.toUpperCase()}` });
    } catch {
      toastManager.add({ type: "error", title: "Copy failed" });
    }
  };

  if (!props.projectId) {
    return (
      <PanelStateMessage density={compact ? "compact" : "comfortable"}>
        Select a project to manage database connections.
      </PanelStateMessage>
    );
  }

  const title =
    props.projectName && props.projectName.trim().length > 0
      ? `Databases · ${props.projectName}`
      : "Databases";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-2",
        compact ? "p-2.5" : "p-4 md:p-6",
        props.className,
      )}
      data-testid="database-query-surface"
      data-mode={props.mode}
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          className={cn(
            "min-w-0 truncate font-medium text-foreground",
            compact ? "text-sm" : "text-base",
          )}
        >
          {title}
        </h2>
        <div className="flex items-center gap-1.5">
          {selected ? (
            <Button
              type="button"
              size="sm"
              variant={schemaOpen ? "secondary" : "outline"}
              onClick={() => setSchemaOpen((open) => !open)}
              title="Toggle schema browser"
            >
              Schema
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={openCreate}>
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {loading && connections.length === 0 ? (
        <PanelStateMessage density="compact">Loading connections…</PanelStateMessage>
      ) : null}

      {!loading && connections.length === 0 ? (
        <Empty className={compact ? "gap-3 p-4" : undefined}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseIcon />
            </EmptyMedia>
            <EmptyTitle>No connections</EmptyTitle>
            <EmptyDescription>
              Add local, dev, or prd — then run SQL without leaving chat.
            </EmptyDescription>
          </EmptyHeader>
          <Button type="button" size="sm" onClick={openCreate}>
            Add connection
          </Button>
        </Empty>
      ) : null}

      {connections.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 pb-px">
            {connections.map((connection) => {
              const active = connection.id === selectedId;
              return (
                <div
                  key={connection.id}
                  className={cn(
                    "group/conn-tab relative flex shrink-0 items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 transition-colors",
                    active
                      ? "border-border bg-background text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    className="flex max-w-[8.5rem] items-center gap-1 px-1.5 py-1.5 text-xs"
                    onClick={() => selectConnection(connection.id)}
                  >
                    <span className="truncate font-medium leading-none">{connection.label}</span>
                    <span className="shrink-0 text-[9px] font-medium uppercase leading-none tracking-wide opacity-55">
                      {connection.engine === "postgres" ? "pg" : "sql"}
                    </span>
                  </button>
                  <div
                    className={cn(
                      "flex items-center gap-0.5 transition-opacity",
                      // Only on hover (or keyboard focus inside the tab) — never permanently on active.
                      "pointer-events-none opacity-0 group-hover/conn-tab:pointer-events-auto group-hover/conn-tab:opacity-100 group-focus-within/conn-tab:pointer-events-auto group-focus-within/conn-tab:opacity-100",
                    )}
                  >
                    <button
                      type="button"
                      className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${connection.label}`}
                      title="Edit connection"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openEdit(connection);
                      }}
                    >
                      <PencilIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground"
                      aria-label={`Remove ${connection.label}`}
                      title="Remove connection"
                      disabled={saving}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleDelete(connection);
                      }}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
              {schemaOpen ? (
                <div className={cn("min-h-0 shrink-0", compact ? "w-[9.5rem]" : "w-52")}>
                  <SchemaTreePanel
                    schema={schema}
                    loading={schemaLoading}
                    error={schemaError}
                    compact={compact}
                    onRefresh={() => {
                      if (selectedId) {
                        void loadSchema(selectedId);
                      }
                    }}
                    onInsertSelect={(tableName, schemaName) => {
                      const qualified =
                        schemaName && schemaName !== "public"
                          ? `${schemaName}.${tableName}`
                          : tableName;
                      setSql(`select * from ${qualified} limit 100`);
                    }}
                  />
                </div>
              ) : null}

              <div
                ref={workAreaRef}
                className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 pl-0"
              >
              <div className="flex shrink-0 items-center justify-end gap-2 pb-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleRun(sqlEditorRef.current?.getSqlToRun())}
                  disabled={running}
                >
                  {running ? "Running…" : "Run"}
                </Button>
              </div>

              <div
                className={cn(
                  "flex min-h-0 flex-col",
                  editorFillsPane ? "min-h-0 flex-1" : "shrink-0",
                )}
                style={
                  !editorFillsPane && editorHeightPx !== null
                    ? { height: editorHeightPx }
                    : undefined
                }
              >
                <SqlEditor
                  ref={sqlEditorRef}
                  value={sql}
                  onChange={setSql}
                  onRun={(sqlToRun) => {
                    void handleRun(sqlToRun);
                  }}
                  compact={compact}
                  fill
                  extraWords={extraWords}
                  placeholder="select id, title from notes order by id"
                  className="h-full min-h-0"
                />
              </div>

              {hasResults ? (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize SQL editor"
                  title="Drag to resize editor"
                  className="group/resize flex h-2 shrink-0 cursor-row-resize items-center justify-center"
                  onPointerDown={beginEditorResize}
                >
                  <div className="h-0.5 w-10 rounded-full bg-border transition-colors group-hover/resize:bg-muted-foreground/50 group-active/resize:bg-muted-foreground/70" />
                </div>
              ) : null}

              {queryResult ? (
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      {queryResult.rowCount} row{queryResult.rowCount === 1 ? "" : "s"}
                      {queryResult.truncated ? " (truncated)" : ""}
                      {` · ${queryResult.durationMs}ms`}
                      {queryResult.command ? ` · ${queryResult.command}` : ""}
                      {editTarget ? " · click a cell to edit" : ""}
                    </span>
                    {queryResult.columns.length > 0 ? (
                      <div className="flex items-center gap-1">
                        {editTarget ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handlePush()}
                            disabled={pushing || dirtyList.length === 0}
                          >
                            {pushing
                              ? "Pushing…"
                              : dirtyList.length > 0
                                ? `Push changes (${dirtyList.length})`
                                : "Push changes"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopy("tsv")}
                        >
                          Copy TSV
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopy("markdown")}
                        >
                          Copy MD
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {queryResult.columns.length > 0 ? (
                    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background">
                      <table className="w-full min-w-full border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 z-10 bg-muted">
                          <tr>
                            {queryResult.columns.map((column) => (
                              <th
                                key={column}
                                className="border border-border px-2 py-1.5 font-semibold text-foreground"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((row, rowIndex) => {
                            const pkIndex = editTarget
                              ? queryResult.columns.indexOf(editTarget.primaryKeyColumn)
                              : -1;
                            const pkValue = pkIndex >= 0 ? row[pkIndex] : null;
                            const canEditRow =
                              editTarget !== null &&
                              pkValue !== null &&
                              (typeof pkValue === "string" ||
                                typeof pkValue === "number" ||
                                typeof pkValue === "boolean");

                            return (
                              <tr key={rowIndex} className="odd:bg-muted/25">
                                {row.map((cell, cellIndex) => {
                                  const column = queryResult.columns[cellIndex]!;
                                  const isPk = editTarget?.primaryKeyColumn === column;
                                  const editable = canEditRow && !isPk;
                                  const key =
                                    canEditRow && !isPk
                                      ? dirtyKey(pkValue as string | number | boolean, column)
                                      : null;
                                  const isDirty = key ? key in dirtyByKey : false;

                                  return (
                                    <td
                                      key={cellIndex}
                                      className={cn(
                                        "max-w-[14rem] border border-border px-0 py-0 font-mono text-foreground/90",
                                        isDirty && "bg-amber-500/10",
                                      )}
                                    >
                                      {editable ? (
                                        <input
                                          className="w-full min-w-[4rem] bg-transparent px-2 py-1 outline-none focus:bg-sky-500/10"
                                          defaultValue={cell === null ? "" : String(cell)}
                                          key={`${String(pkValue)}-${column}-${String(cell)}`}
                                          title={
                                            cell === null
                                              ? "null — edit then Push"
                                              : `${String(cell)} — edit then Push`
                                          }
                                          onBlur={(event) => {
                                            handleCellCommit({
                                              primaryKey: pkValue as string | number | boolean,
                                              column,
                                              previous: cell,
                                              raw: event.currentTarget.value,
                                            });
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.currentTarget.blur();
                                            }
                                            if (event.key === "Escape") {
                                              event.currentTarget.value =
                                                cell === null ? "" : String(cell);
                                              event.currentTarget.blur();
                                            }
                                          }}
                                        />
                                      ) : (
                                        <div
                                          className="truncate px-2 py-1"
                                          title={cell === null ? "null" : String(cell)}
                                        >
                                          {cell === null ? (
                                            <span className="text-muted-foreground/55">null</span>
                                          ) : (
                                            String(cell)
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Statement completed with no result grid.
                    </p>
                  )}
                </div>
              ) : null}
              </div>
            </div>
          ) : (
            <PanelStateMessage density="compact">Select a connection tab.</PanelStateMessage>
          )}
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          } else {
            setDialogOpen(true);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit connection" : "New connection"}</DialogTitle>
            <DialogDescription>
              Passwords stay on the server. Delete from the connection tab hover (×).
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {draft ? (
              <ConnectionForm
                draft={draft}
                hasPassword={
                  Boolean(draft.id) &&
                  (connections.find((connection) => connection.id === draft.id)?.hasPassword ??
                    false)
                }
                onChange={setDraft}
              />
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={testing || saving || !draft}
            >
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !draft}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function ConnectionForm(props: {
  draft: DraftForm;
  hasPassword: boolean;
  onChange: (draft: DraftForm) => void;
}) {
  const { draft } = props;
  const set = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    props.onChange({ ...draft, [key]: value });
  };

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Label">
          <Input
            value={draft.label}
            placeholder="local / dev / prd"
            onChange={(event) => set("label", event.target.value)}
          />
        </Field>
        <Field label="Engine">
          <select
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={draft.engine}
            onChange={(event) => set("engine", event.target.value as DatabaseEngine)}
          >
            <option value="postgres">Postgres</option>
            <option value="sqlite">SQLite</option>
          </select>
        </Field>
      </div>

      {draft.engine === "postgres" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Host">
            <Input value={draft.host} onChange={(event) => set("host", event.target.value)} />
          </Field>
          <Field label="Port">
            <Input value={draft.port} onChange={(event) => set("port", event.target.value)} />
          </Field>
          <Field label="Database">
            <Input
              value={draft.database}
              onChange={(event) => set("database", event.target.value)}
            />
          </Field>
          <Field label="User">
            <Input value={draft.user} onChange={(event) => set("user", event.target.value)} />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={draft.password}
              placeholder={props.hasPassword ? "•••••••• (unchanged)" : ""}
              onChange={(event) => set("password", event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <label className="flex items-center gap-2 pt-5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.ssl}
              onChange={(event) => set("ssl", event.target.checked)}
            />
            SSL
          </label>
        </div>
      ) : (
        <Field label="SQLite file path">
          <Input
            value={draft.filePath}
            placeholder="/absolute/path/to.db"
            onChange={(event) => set("filePath", event.target.value)}
          />
        </Field>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={draft.readOnly}
          onChange={(event) => set("readOnly", event.target.checked)}
        />
        Read-only (preferred for prd)
      </label>

      {props.hasPassword ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.clearPassword}
            onChange={(event) => set("clearPassword", event.target.checked)}
          />
          Clear stored password
        </label>
      ) : null}
    </div>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}
