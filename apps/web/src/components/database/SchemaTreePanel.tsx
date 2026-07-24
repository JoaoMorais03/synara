// FILE: SchemaTreePanel.tsx
// Purpose: IntelliJ-style collapsible schema tree (schema → tables → columns + types).
// Layer: Database UI

import type { DatabaseInspectSchemaResult, DatabaseSchemaTable } from "@synara/contracts";
import { useMemo, useState } from "react";

import { cn } from "~/lib/utils";

export function SchemaTreePanel(props: {
  schema: DatabaseInspectSchemaResult | null;
  loading: boolean;
  error: string | null;
  compact?: boolean;
  onRefresh: () => void;
  onInsertSelect: (tableName: string, schemaName?: string) => void;
  className?: string;
}) {
  const [openNamespaces, setOpenNamespaces] = useState<Record<string, boolean>>({});
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});

  const namespaces = props.schema?.namespaces ?? [];

  const defaultOpen = useMemo(() => {
    // First open is implicit for single-namespace sources (sqlite main / one schema).
    return namespaces.length === 1 ? namespaces[0]!.name : null;
  }, [namespaces]);

  const isNamespaceOpen = (name: string) =>
    openNamespaces[name] ?? (defaultOpen !== null && defaultOpen === name);

  const toggleNamespace = (name: string) => {
    setOpenNamespaces((current) => ({
      ...current,
      [name]: !isNamespaceOpen(name),
    }));
  };

  const toggleTable = (key: string) => {
    setOpenTables((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col border-r border-border/70 bg-muted/15",
        props.className,
      )}
    >
      <div className="flex items-center justify-between gap-1 border-b border-border/60 px-2 py-1.5">
        <span className="text-[11px] font-medium text-foreground">Schema</span>
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={props.onRefresh}
          disabled={props.loading}
        >
          {props.loading ? "…" : "Refresh"}
        </button>
      </div>

      <div className="min-h-0 flex-1 cursor-default select-none overflow-auto px-1 py-1 text-[11px]">
        {props.error ? (
          <p className="px-1.5 py-1 text-destructive">{props.error}</p>
        ) : null}
        {props.loading && !props.schema ? (
          <p className="px-1.5 py-1 text-muted-foreground">Loading…</p>
        ) : null}
        {!props.loading && props.schema && namespaces.length === 0 ? (
          <p className="px-1.5 py-1 text-muted-foreground">No tables found.</p>
        ) : null}

        {namespaces.map((namespace) => {
          const nsOpen = isNamespaceOpen(namespace.name);
          return (
            <div key={namespace.name} className="mb-0.5">
              <button
                type="button"
                className="flex h-6 w-full items-center gap-1 rounded px-1 text-left text-foreground/90 hover:bg-muted/60"
                onClick={() => toggleNamespace(namespace.name)}
              >
                <Chevron open={nsOpen} />
                <span className="leading-none font-medium">{namespace.name}</span>
                <span className="leading-none text-muted-foreground/60">· {namespace.tables.length}</span>
              </button>
              {nsOpen
                ? namespace.tables.map((table) => (
                    <TableNode
                      key={`${namespace.name}.${table.name}`}
                      namespace={namespace.name}
                      table={table}
                      open={Boolean(openTables[`${namespace.name}.${table.name}`])}
                      onToggle={() => toggleTable(`${namespace.name}.${table.name}`)}
                      onInsertSelect={() =>
                        props.onInsertSelect(
                          table.name,
                          namespace.name === "main" || namespace.name === "public"
                            ? undefined
                            : namespace.name,
                        )
                      }
                    />
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableNode(props: {
  namespace: string;
  table: DatabaseSchemaTable;
  open: boolean;
  onToggle: () => void;
  onInsertSelect: () => void;
}) {
  return (
    <div className="ml-2">
      <div className="group/table flex items-center gap-0.5">
        <button
          type="button"
          className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1 text-left hover:bg-muted/60"
          onClick={props.onToggle}
          onDoubleClick={(event) => {
            event.preventDefault();
            props.onInsertSelect();
          }}
          title="Double-click to select * from table"
        >
          <Chevron open={props.open} />
          <span className="truncate leading-none text-foreground">{props.table.name}</span>
        </button>
      </div>
      {props.open
        ? props.table.columns.map((column) => {
            const typeLabel = [
              column.dataType,
              column.nullable ? null : "not null",
              column.isPrimaryKey ? "pk" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={column.name}
                className="ml-5 flex min-w-0 cursor-default select-none items-baseline gap-1.5 px-1 py-0.5"
                title={typeLabel}
              >
                {/* Name is primary — never ellipsis the identifier first. */}
                <span className="min-w-0 shrink font-medium text-foreground/90">
                  {column.name}
                </span>
                {column.isPrimaryKey ? (
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-sky-500/80">
                    pk
                  </span>
                ) : null}
                {/* Type is secondary — ellipsis here; full type on hover via title. */}
                <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground/70">
                  {column.dataType}
                </span>
              </div>
            );
          })
        : null}
    </div>
  );
}

function Chevron(props: { open: boolean }) {
  // Fixed square hit/box + SVG so the glyph is optically centered with the row text
  // (text ▶ sits on the font baseline and reads low next to labels).
  return (
    <span
      className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/70"
      aria-hidden
    >
      <svg
        viewBox="0 0 10 10"
        className={cn("size-2.5 origin-center transition-transform duration-150", props.open && "rotate-90")}
        fill="currentColor"
      >
        <path d="M3.2 1.6v6.8L8.4 5 3.2 1.6z" />
      </svg>
    </span>
  );
}
