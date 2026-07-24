// FILE: MarkdownNotesSurface.tsx
// Purpose: Bottom-right floating FAB + resizable markdown notes popup backed by disk .md files.
// Layer: Global overlay portaled to document.body from the root route.

import type { MarkdownNote, MarkdownNoteSummary } from "@synara/contracts";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import ChatMarkdown from "~/components/ChatMarkdown";
import { ensureNativeApi } from "~/nativeApi";
import { FileIcon, PencilIcon, EyeIcon, PlusIcon, XIcon } from "~/lib/icons";
import {
  readMarkdownNotesUiState,
  writeMarkdownNotesUiState,
  type MarkdownNotesUiState,
} from "~/lib/markdownNotesUiStore";
import { toggleMarkdownTaskMarker } from "~/lib/markdownTaskList";
import { cn } from "~/lib/utils";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const MIN_HEIGHT = 240;
const MAX_HEIGHT = 800;

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function promptNoteTitle(defaultTitle = ""): string | null {
  const raw = window.prompt("Name this note", defaultTitle);
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPlaceholderTitle(title: string): boolean {
  return /^Untitled(?:\s+\d+)?$/i.test(title.trim());
}

function withDirtyNoteId(
  current: ReadonlySet<string>,
  noteId: string,
  dirty: boolean,
): ReadonlySet<string> {
  const has = current.has(noteId);
  if (dirty === has) {
    return current;
  }
  const next = new Set(current);
  if (dirty) {
    next.add(noteId);
  } else {
    next.delete(noteId);
  }
  return next;
}

export function MarkdownNotesSurface() {
  const [ui, setUi] = useState<MarkdownNotesUiState>(() => readMarkdownNotesUiState());
  const [notes, setNotes] = useState<ReadonlyArray<MarkdownNoteSummary>>([]);
  const [active, setActive] = useState<MarkdownNote | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirtyNoteIds, setDirtyNoteIds] = useState<ReadonlySet<string>>(() => new Set());
  const draftNoteIdRef = useRef<string | null>(null);
  const draftsByIdRef = useRef<Map<string, string>>(new Map());
  const resizeRef = useRef<{
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const persistUi = useEffectEvent((next: MarkdownNotesUiState) => {
    setUi(next);
    writeMarkdownNotesUiState(next);
  });

  const refreshList = useEffectEvent(async () => {
    const api = ensureNativeApi();
    const result = await api.notes.list();
    setNotes(result.notes);
    return result.notes;
  });

  const openNote = useEffectEvent(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      const note = await api.notes.read({ id });
      setActive(note);
      const cached = draftsByIdRef.current.get(note.id);
      const nextDraft = cached ?? note.content;
      setDraft(nextDraft);
      draftNoteIdRef.current = note.id;
      draftsByIdRef.current.set(note.id, nextDraft);
      setDirtyNoteIds((current) => withDirtyNoteId(current, note.id, nextDraft !== note.content));
      persistUi({ ...ui, open: true, lastNoteId: note.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to open note.");
    } finally {
      setBusy(false);
    }
  });

  const ensureOpenNote = useEffectEvent(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await refreshList();
      const preferred =
        (ui.lastNoteId ? list.find((note) => note.id === ui.lastNoteId) : undefined) ?? list[0];
      if (preferred) {
        await openNote(preferred.id);
        return;
      }
      const created = await ensureNativeApi().notes.create({ title: "Untitled" });
      await refreshList();
      setActive(created);
      setDraft(created.content);
      draftNoteIdRef.current = created.id;
      draftsByIdRef.current.set(created.id, created.content);
      setDirtyNoteIds((current) => withDirtyNoteId(current, created.id, false));
      persistUi({ ...ui, open: true, lastNoteId: created.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to open notes.");
    } finally {
      setBusy(false);
    }
  });

  useEffect(() => {
    writeMarkdownNotesUiState(ui);
  }, [ui]);

  useEffect(() => {
    if (!ui.open) {
      return;
    }
    void ensureOpenNote();
  }, [ui.open]);

  useEffect(() => {
    if (!active) {
      return;
    }
    draftsByIdRef.current.set(active.id, draft);
    setDirtyNoteIds((current) => withDirtyNoteId(current, active.id, draft !== active.content));
  }, [active, draft]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) {
        return;
      }
      const dx = event.clientX - resize.startX;
      const dy = event.clientY - resize.startY;
      let width = resize.startWidth;
      let height = resize.startHeight;
      if (resize.edge.includes("e")) {
        width = resize.startWidth + dx;
      }
      if (resize.edge.includes("w")) {
        width = resize.startWidth - dx;
      }
      if (resize.edge.includes("s")) {
        height = resize.startHeight + dy;
      }
      if (resize.edge.includes("n")) {
        height = resize.startHeight - dy;
      }
      persistUi({
        ...ui,
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)),
        height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [ui]);

  const beginResize = (edge: ResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: ui.width,
      startHeight: ui.height,
    };
  };

  const createNote = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await ensureNativeApi().notes.create({ title: "Untitled" });
      await refreshList();
      setActive(created);
      setDraft(created.content);
      draftNoteIdRef.current = created.id;
      draftsByIdRef.current.set(created.id, created.content);
      setDirtyNoteIds((current) => withDirtyNoteId(current, created.id, false));
      persistUi({ ...ui, lastNoteId: created.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create note.");
    } finally {
      setBusy(false);
    }
  };

  const saveActiveNote = useEffectEvent(async () => {
    if (!active || busy) {
      return;
    }
    let noteId = active.id;
    let previousId = active.id;
    if (isPlaceholderTitle(active.title)) {
      const title = promptNoteTitle(active.title === "Untitled" ? "" : active.title);
      if (!title) {
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const summary = await ensureNativeApi().notes.rename({ id: active.id, title });
        noteId = summary.id;
        await refreshList();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to name note.");
        setBusy(false);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const summary = await ensureNativeApi().notes.write({ id: noteId, content: draft });
      const note = await ensureNativeApi().notes.read({ id: summary.id });
      if (previousId !== note.id) {
        draftsByIdRef.current.delete(previousId);
        setDirtyNoteIds((current) => withDirtyNoteId(current, previousId, false));
      }
      draftsByIdRef.current.set(note.id, note.content);
      setDirtyNoteIds((current) => withDirtyNoteId(current, note.id, false));
      setActive(note);
      setDraft(note.content);
      draftNoteIdRef.current = note.id;
      persistUi({ ...ui, lastNoteId: note.id });
      await refreshList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save note.");
    } finally {
      setBusy(false);
    }
  });

  useEffect(() => {
    if (!ui.open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      void saveActiveNote();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ui.open]);

  const deleteNote = async (note: MarkdownNoteSummary) => {
    const confirmed = window.confirm(`Delete “${note.title}”? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureNativeApi().notes.delete({ id: note.id });
      draftsByIdRef.current.delete(note.id);
      setDirtyNoteIds((current) => withDirtyNoteId(current, note.id, false));
      const list = await refreshList();
      if (active?.id === note.id) {
        const next = list[0];
        if (!next) {
          setActive(null);
          setDraft("");
          draftNoteIdRef.current = null;
          persistUi({ ...ui, lastNoteId: null });
        } else {
          await openNote(next.id);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete note.");
    } finally {
      setBusy(false);
    }
  };

  const renameActive = async () => {
    if (!active) {
      return;
    }
    const nextTitle = window.prompt("Rename note", active.title)?.trim();
    if (!nextTitle || nextTitle === active.title) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const previousId = active.id;
      const previousDraft = draft;
      const summary = await ensureNativeApi().notes.rename({ id: active.id, title: nextTitle });
      await refreshList();
      const note = await ensureNativeApi().notes.read({ id: summary.id });
      draftsByIdRef.current.delete(previousId);
      draftsByIdRef.current.set(note.id, previousDraft);
      setDirtyNoteIds((current) =>
        withDirtyNoteId(
          withDirtyNoteId(current, previousId, false),
          note.id,
          previousDraft !== note.content,
        ),
      );
      setActive(note);
      setDraft(previousDraft);
      draftNoteIdRef.current = note.id;
      persistUi({ ...ui, lastNoteId: note.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to rename note.");
    } finally {
      setBusy(false);
    }
  };

  const resizeHandle = (edge: ResizeEdge, className: string) => (
    <div
      key={edge}
      role="separator"
      aria-label={`Resize notes popup (${edge})`}
      onPointerDown={(event) => beginResize(edge, event)}
      className={cn("absolute z-10 touch-none", className)}
    />
  );

  const surface = (
    <>
      <button
        type="button"
        aria-label={ui.open ? "Close markdown notes" : "Open markdown notes"}
        aria-expanded={ui.open}
        onClick={() => persistUi({ ...ui, open: !ui.open })}
        className={cn(
          "fixed bottom-3 right-3 z-[300] inline-flex size-10 items-center justify-center rounded-md",
          "border border-white/[0.08] bg-popover/90 text-popover-foreground shadow-xl backdrop-blur-xl",
          "transition-[transform,box-shadow,border-color,background-color] duration-150",
          "hover:border-primary/40 hover:shadow-2xl hover:[transform:translateY(-1px)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          ui.open && "border-primary/50 bg-primary/15 text-foreground",
        )}
      >
        <FileIcon className="size-4" />
      </button>

      {ui.open ? (
        <div
          className={cn(
            "fixed bottom-16 right-3 z-[300] flex flex-col overflow-hidden rounded-xl",
            "border border-white/[0.08] bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl",
          )}
          style={{ width: ui.width, height: ui.height }}
          role="dialog"
          aria-label="Markdown notes"
        >
          <header className="flex shrink-0 items-center gap-1.5 border-b border-border/60 px-2 py-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {notes.map((note) => {
                const selected = active?.id === note.id;
                const dirty = dirtyNoteIds.has(note.id);
                return (
                  <div
                    key={note.id}
                    className={cn(
                      "group relative flex max-w-[12rem] shrink-0 items-center gap-1.5 rounded-md",
                      selected
                        ? "bg-[var(--sidebar-accent)] text-foreground"
                        : "text-muted-foreground hover:bg-[var(--sidebar-accent)]/70 hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      title={`${note.title} (double-click to rename)`}
                      onClick={() => void openNote(note.id)}
                      onDoubleClick={() => {
                        if (selected) {
                          void renameActive();
                        }
                      }}
                      className={cn(
                        "min-w-0 flex-1 truncate py-1.5 pl-2.5 pr-1 text-left text-[13px] leading-snug",
                        selected && "font-medium",
                      )}
                    >
                      {note.title}
                    </button>
                    <div className="relative mr-0.5 size-6 shrink-0">
                      <span
                        aria-hidden={!dirty}
                        aria-label={dirty ? "Unsaved changes" : undefined}
                        title={dirty ? "Unsaved changes" : undefined}
                        className={cn(
                          "pointer-events-none absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70",
                          dirty ? "opacity-100 group-hover:opacity-0" : "opacity-0",
                        )}
                      />
                      <button
                        type="button"
                        aria-label={`Delete ${note.title}`}
                        disabled={busy}
                        title="Delete note"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteNote(note);
                        }}
                        className={cn(
                          "absolute inset-0 inline-flex items-center justify-center rounded",
                          "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                          "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                        )}
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                aria-label="New note"
                disabled={busy}
                onClick={() => void createNote()}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--sidebar-accent)] hover:text-foreground"
              >
                <PlusIcon className="size-4" />
              </button>
            </div>

            <div
              className="inline-flex shrink-0 items-center rounded-md border border-border/60 bg-background/40 p-0.5"
              role="group"
              aria-label="Editor mode"
            >
              <button
                type="button"
                aria-pressed={!ui.preview}
                aria-label="Code"
                title="Code"
                onClick={() => persistUi({ ...ui, preview: false })}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded transition-colors",
                  !ui.preview
                    ? "bg-[var(--sidebar-accent)] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                aria-pressed={ui.preview}
                aria-label="Preview"
                title="Preview"
                onClick={() => persistUi({ ...ui, preview: true })}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded transition-colors",
                  ui.preview
                    ? "bg-[var(--sidebar-accent)] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <EyeIcon className="size-3.5" />
              </button>
            </div>

            <button
              type="button"
              aria-label="Close notes"
              onClick={() => persistUi({ ...ui, open: false })}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--sidebar-accent)] hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </header>

          {error ? (
            <p className="shrink-0 border-b border-border/60 px-3 py-1.5 text-xs text-rose-300/90">
              {error}
            </p>
          ) : null}

          <div className="min-h-0 flex-1">
            {ui.preview ? (
              <div className="h-full overflow-y-auto px-3 py-2 text-sm">
                {draft.trim().length > 0 ? (
                  <ChatMarkdown
                    text={draft}
                    cwd={undefined}
                    onTaskToggle={({ sourceLine, checked }) => {
                      const next = toggleMarkdownTaskMarker(draft, sourceLine, checked);
                      if (next === null) {
                        return;
                      }
                      setDraft(next);
                    }}
                  />
                ) : (
                  <p className="text-muted-foreground">Empty note</p>
                )}
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck
                placeholder={"# Title\n\nWrite markdown…"}
                className={cn(
                  "h-full w-full resize-none bg-transparent px-3 py-2 font-mono text-sm leading-relaxed",
                  "outline-none placeholder:text-muted-foreground/60",
                )}
              />
            )}
          </div>

          {resizeHandle("n", "inset-x-2 top-0 h-1.5 cursor-ns-resize")}
          {resizeHandle("s", "inset-x-2 bottom-0 h-1.5 cursor-ns-resize")}
          {resizeHandle("e", "inset-y-2 right-0 w-1.5 cursor-ew-resize")}
          {resizeHandle("w", "inset-y-2 left-0 w-1.5 cursor-ew-resize")}
          {resizeHandle("nw", "left-0 top-0 size-3 cursor-nwse-resize")}
          {resizeHandle("ne", "right-0 top-0 size-3 cursor-nesw-resize")}
          {resizeHandle("sw", "bottom-0 left-0 size-3 cursor-nesw-resize")}
          {resizeHandle("se", "bottom-0 right-0 size-3 cursor-nwse-resize")}
        </div>
      ) : null}
    </>
  );

  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(surface, document.body);
}
