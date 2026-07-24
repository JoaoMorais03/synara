// FILE: markdownNotesUiStore.ts
// Purpose: Persist floating markdown notes UI chrome (open/size/last note) in localStorage.
// Note content lives on disk via the notes NativeApi.

const STORAGE_KEY = "synara:markdown-notes-ui:v1";

export type MarkdownNotesUiState = {
  open: boolean;
  width: number;
  height: number;
  lastNoteId: string | null;
  preview: boolean;
};

const DEFAULT_STATE: MarkdownNotesUiState = {
  open: false,
  width: 420,
  height: 460,
  lastNoteId: null,
  preview: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readMarkdownNotesUiState(): MarkdownNotesUiState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<MarkdownNotesUiState>;
    return {
      open: Boolean(parsed.open),
      width: clamp(Number(parsed.width) || DEFAULT_STATE.width, 320, 900),
      height: clamp(Number(parsed.height) || DEFAULT_STATE.height, 240, 800),
      lastNoteId: typeof parsed.lastNoteId === "string" ? parsed.lastNoteId : null,
      preview: Boolean(parsed.preview),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function writeMarkdownNotesUiState(state: MarkdownNotesUiState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        open: state.open,
        width: clamp(state.width, 320, 900),
        height: clamp(state.height, 240, 800),
        lastNoteId: state.lastNoteId,
        preview: state.preview,
      }),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}
