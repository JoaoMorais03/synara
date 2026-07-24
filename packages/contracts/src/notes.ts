import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

const NOTE_ID_MAX_LENGTH = 180;
const NOTE_TITLE_MAX_LENGTH = 160;
const NOTE_CONTENT_MAX_LENGTH = 512_000;

/** Markdown body may keep leading/trailing whitespace and trailing newlines. */
const MarkdownNoteContent = Schema.String.check(Schema.isMaxLength(NOTE_CONTENT_MAX_LENGTH));

export const MarkdownNoteId = TrimmedNonEmptyString.check(Schema.isMaxLength(NOTE_ID_MAX_LENGTH));
export type MarkdownNoteId = typeof MarkdownNoteId.Type;

export const MarkdownNoteSummary = Schema.Struct({
  id: MarkdownNoteId,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(NOTE_TITLE_MAX_LENGTH)),
  updatedAt: IsoDateTime,
});
export type MarkdownNoteSummary = typeof MarkdownNoteSummary.Type;

export const MarkdownNote = Schema.Struct({
  id: MarkdownNoteId,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(NOTE_TITLE_MAX_LENGTH)),
  content: MarkdownNoteContent,
  updatedAt: IsoDateTime,
});
export type MarkdownNote = typeof MarkdownNote.Type;

export const NotesListInput = Schema.Struct({});
export type NotesListInput = typeof NotesListInput.Type;

export const NotesListResult = Schema.Struct({
  notes: Schema.Array(MarkdownNoteSummary),
  notesDir: TrimmedNonEmptyString,
});
export type NotesListResult = typeof NotesListResult.Type;

export const NotesReadInput = Schema.Struct({
  id: MarkdownNoteId,
});
export type NotesReadInput = typeof NotesReadInput.Type;

export const NotesWriteInput = Schema.Struct({
  id: MarkdownNoteId,
  content: MarkdownNoteContent,
});
export type NotesWriteInput = typeof NotesWriteInput.Type;

export const NotesCreateInput = Schema.Struct({
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(NOTE_TITLE_MAX_LENGTH))),
});
export type NotesCreateInput = typeof NotesCreateInput.Type;

export const NotesDeleteInput = Schema.Struct({
  id: MarkdownNoteId,
});
export type NotesDeleteInput = typeof NotesDeleteInput.Type;

export const NotesRenameInput = Schema.Struct({
  id: MarkdownNoteId,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(NOTE_TITLE_MAX_LENGTH)),
});
export type NotesRenameInput = typeof NotesRenameInput.Type;
