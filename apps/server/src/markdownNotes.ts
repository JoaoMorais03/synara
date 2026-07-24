// FILE: markdownNotes.ts
// Purpose: Disk-backed global markdown notes under Synara stateDir/notes.
// Layer: Server filesystem helpers for the floating notes popup.

import { Effect } from "effect";
import * as FS from "node:fs/promises";
import * as nodePath from "node:path";

import type {
  MarkdownNote,
  MarkdownNoteId,
  MarkdownNoteSummary,
  NotesCreateInput,
  NotesListResult,
  NotesRenameInput,
  NotesWriteInput,
} from "@synara/contracts";

const MARKDOWN_EXTENSION = ".md";

export class MarkdownNotesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownNotesError";
  }
}

export function resolveNotesDir(stateDir: string): string {
  return nodePath.join(stateDir, "notes");
}

function titleFromId(id: string): string {
  return id.endsWith(MARKDOWN_EXTENSION) ? id.slice(0, -MARKDOWN_EXTENSION.length) : id;
}

function sanitizeTitle(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  const base = trimmed.length > 0 ? trimmed : "Untitled";
  const cleaned = base
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return cleaned.length > 0 ? cleaned : "Untitled";
}

function idFromTitle(title: string): MarkdownNoteId {
  return `${sanitizeTitle(title)}${MARKDOWN_EXTENSION}` as MarkdownNoteId;
}

function assertSafeNoteId(id: string): MarkdownNoteId {
  const trimmed = id.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    nodePath.isAbsolute(trimmed) ||
    !trimmed.toLowerCase().endsWith(MARKDOWN_EXTENSION)
  ) {
    throw new MarkdownNotesError("Invalid note id.");
  }
  return trimmed as MarkdownNoteId;
}

function resolveNotePath(notesDir: string, id: MarkdownNoteId): string {
  const absolute = nodePath.resolve(notesDir, id);
  const root = nodePath.resolve(notesDir);
  if (absolute !== root && !absolute.startsWith(`${root}${nodePath.sep}`)) {
    throw new MarkdownNotesError("Note path escapes the notes directory.");
  }
  return absolute;
}

async function ensureNotesDir(notesDir: string): Promise<void> {
  await FS.mkdir(notesDir, { recursive: true });
}

async function uniqueNoteId(
  notesDir: string,
  desiredTitle: string,
  options?: { readonly allowId?: MarkdownNoteId },
): Promise<MarkdownNoteId> {
  const baseTitle = sanitizeTitle(desiredTitle);
  let candidate = idFromTitle(baseTitle);
  let suffix = 2;
  while (true) {
    try {
      await FS.access(resolveNotePath(notesDir, candidate));
      if (options?.allowId === candidate) {
        return candidate;
      }
      candidate = idFromTitle(`${baseTitle} ${suffix}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

function toIso(mtimeMs: number): string {
  return new Date(mtimeMs).toISOString();
}

export async function listMarkdownNotes(stateDir: string): Promise<NotesListResult> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const entries = await FS.readdir(notesDir, { withFileTypes: true });
  const notes: MarkdownNoteSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
      continue;
    }
    try {
      const id = assertSafeNoteId(entry.name);
      const stat = await FS.stat(resolveNotePath(notesDir, id));
      notes.push({
        id,
        title: titleFromId(id),
        updatedAt: toIso(stat.mtimeMs),
      });
    } catch {
      // Skip unexpected entries instead of failing the whole list.
    }
  }
  notes.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return { notes, notesDir };
}

export async function readMarkdownNote(stateDir: string, id: string): Promise<MarkdownNote> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const safeId = assertSafeNoteId(id);
  const filePath = resolveNotePath(notesDir, safeId);
  try {
    const [content, stat] = await Promise.all([FS.readFile(filePath, "utf8"), FS.stat(filePath)]);
    return {
      id: safeId,
      title: titleFromId(safeId),
      content,
      updatedAt: toIso(stat.mtimeMs),
    };
  } catch (error) {
    throw new MarkdownNotesError(
      error instanceof Error ? error.message : "Failed to read markdown note.",
    );
  }
}

export async function writeMarkdownNote(
  stateDir: string,
  input: NotesWriteInput,
): Promise<MarkdownNoteSummary> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const safeId = assertSafeNoteId(input.id);
  const filePath = resolveNotePath(notesDir, safeId);
  try {
    await FS.writeFile(filePath, input.content, "utf8");
    const stat = await FS.stat(filePath);
    return {
      id: safeId,
      title: titleFromId(safeId),
      updatedAt: toIso(stat.mtimeMs),
    };
  } catch (error) {
    throw new MarkdownNotesError(
      error instanceof Error ? error.message : "Failed to write markdown note.",
    );
  }
}

export async function createMarkdownNote(
  stateDir: string,
  input: NotesCreateInput = {},
): Promise<MarkdownNote> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const id = await uniqueNoteId(notesDir, input.title ?? "Untitled");
  const content = "";
  const filePath = resolveNotePath(notesDir, id);
  await FS.writeFile(filePath, content, "utf8");
  const stat = await FS.stat(filePath);
  return {
    id,
    title: titleFromId(id),
    content,
    updatedAt: toIso(stat.mtimeMs),
  };
}

export async function deleteMarkdownNote(
  stateDir: string,
  id: string,
): Promise<{ deleted: boolean }> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const safeId = assertSafeNoteId(id);
  const filePath = resolveNotePath(notesDir, safeId);
  try {
    await FS.unlink(filePath);
    return { deleted: true };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return { deleted: false };
    }
    throw new MarkdownNotesError(
      error instanceof Error ? error.message : "Failed to delete markdown note.",
    );
  }
}

export async function renameMarkdownNote(
  stateDir: string,
  input: NotesRenameInput,
): Promise<MarkdownNoteSummary> {
  const notesDir = resolveNotesDir(stateDir);
  await ensureNotesDir(notesDir);
  const safeId = assertSafeNoteId(input.id);
  const nextId = await uniqueNoteId(notesDir, input.title, { allowId: safeId });
  if (nextId === safeId) {
    const stat = await FS.stat(resolveNotePath(notesDir, safeId));
    return { id: safeId, title: titleFromId(safeId), updatedAt: toIso(stat.mtimeMs) };
  }
  const fromPath = resolveNotePath(notesDir, safeId);
  const toPath = resolveNotePath(notesDir, nextId);
  try {
    await FS.rename(fromPath, toPath);
    const stat = await FS.stat(toPath);
    return {
      id: nextId,
      title: titleFromId(nextId),
      updatedAt: toIso(stat.mtimeMs),
    };
  } catch (error) {
    throw new MarkdownNotesError(
      error instanceof Error ? error.message : "Failed to rename markdown note.",
    );
  }
}

export const markdownNotesEffect = {
  list: (stateDir: string) =>
    Effect.tryPromise({
      try: () => listMarkdownNotes(stateDir),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to list markdown notes."),
    }),
  read: (stateDir: string, id: string) =>
    Effect.tryPromise({
      try: () => readMarkdownNote(stateDir, id),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to read markdown note."),
    }),
  write: (stateDir: string, input: NotesWriteInput) =>
    Effect.tryPromise({
      try: () => writeMarkdownNote(stateDir, input),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to write markdown note."),
    }),
  create: (stateDir: string, input?: NotesCreateInput) =>
    Effect.tryPromise({
      try: () => createMarkdownNote(stateDir, input ?? {}),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to create markdown note."),
    }),
  delete: (stateDir: string, id: string) =>
    Effect.tryPromise({
      try: () => deleteMarkdownNote(stateDir, id),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to delete markdown note."),
    }),
  rename: (stateDir: string, input: NotesRenameInput) =>
    Effect.tryPromise({
      try: () => renameMarkdownNote(stateDir, input),
      catch: (cause) =>
        cause instanceof MarkdownNotesError
          ? cause
          : new MarkdownNotesError("Failed to rename markdown note."),
    }),
};
