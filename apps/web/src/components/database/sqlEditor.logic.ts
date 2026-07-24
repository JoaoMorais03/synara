// FILE: sqlEditor.logic.ts
// Purpose: Lightweight SQL highlight + autocomplete helpers (no editor deps).
// Layer: Database UI pure logic

export const SQL_KEYWORDS = [
  "select",
  "from",
  "where",
  "and",
  "or",
  "not",
  "in",
  "is",
  "null",
  "like",
  "ilike",
  "between",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "as",
  "order",
  "by",
  "group",
  "having",
  "limit",
  "offset",
  "insert",
  "into",
  "values",
  "update",
  "set",
  "delete",
  "create",
  "table",
  "alter",
  "drop",
  "index",
  "view",
  "with",
  "recursive",
  "union",
  "all",
  "distinct",
  "case",
  "when",
  "then",
  "else",
  "end",
  "exists",
  "true",
  "false",
  "asc",
  "desc",
  "nulls",
  "first",
  "last",
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "coalesce",
  "cast",
  "explain",
  "analyze",
  "pragma",
  "returning",
  "primary",
  "key",
  "foreign",
  "references",
  "default",
  "constraint",
  "unique",
  "check",
  "if",
  "using",
  "over",
  "partition",
  "window",
  "interval",
  "current_date",
  "current_timestamp",
  "now",
] as const;

const KEYWORD_SET = new Set<string>(SQL_KEYWORDS.map((word) => word.toUpperCase()));

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Tokenize SQL into highlighted HTML for the mirror layer under the textarea. */
export function highlightSqlToHtml(sql: string): string {
  if (!sql) {
    return "";
  }
  let html = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;

    // line comment
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const slice = end === -1 ? sql.slice(i) : sql.slice(i, end);
      html += `<span class="sql-comment">${escapeHtml(slice)}</span>`;
      i += slice.length;
      continue;
    }

    // block comment
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const slice = end === -1 ? sql.slice(i) : sql.slice(i, end + 2);
      html += `<span class="sql-comment">${escapeHtml(slice)}</span>`;
      i += slice.length;
      continue;
    }

    // string
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      html += `<span class="sql-string">${escapeHtml(sql.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // number
    if (/\d/.test(ch) || (ch === "." && i + 1 < sql.length && /\d/.test(sql[i + 1]!))) {
      let j = i + 1;
      while (j < sql.length && /[\d.]/.test(sql[j]!)) {
        j += 1;
      }
      html += `<span class="sql-number">${escapeHtml(sql.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) {
        j += 1;
      }
      const word = sql.slice(i, j);
      if (KEYWORD_SET.has(word.toUpperCase())) {
        html += `<span class="sql-keyword">${escapeHtml(word)}</span>`;
      } else {
        html += `<span class="sql-ident">${escapeHtml(word)}</span>`;
      }
      i = j;
      continue;
    }

    html += escapeHtml(ch);
    i += 1;
  }
  // Keep trailing newline visible so mirror height matches textarea.
  return html.endsWith("\n") ? `${html}<br/>` : html;
}

export function getWordRangeAt(sql: string, caret: number): { start: number; end: number; word: string } {
  const clamped = Math.max(0, Math.min(caret, sql.length));
  let start = clamped;
  let end = clamped;
  while (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1]!)) {
    start -= 1;
  }
  while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end]!)) {
    end += 1;
  }
  return { start, end, word: sql.slice(start, end) };
}

export function suggestSqlCompletions(input: {
  sql: string;
  caret: number;
  extraWords?: readonly string[];
  limit?: number;
}): string[] {
  const { word } = getWordRangeAt(input.sql, input.caret);
  const prefix = word.toLowerCase();
  if (prefix.length === 0) {
    return [];
  }
  const limit = input.limit ?? 12;
  const pool = new Set<string>([...SQL_KEYWORDS, ...(input.extraWords ?? [])]);
  const matches = [...pool]
    .filter((candidate) => candidate.toLowerCase().startsWith(prefix) && candidate.toLowerCase() !== prefix)
    .sort((left, right) => left.localeCompare(right));
  return matches.slice(0, limit);
}

export function applyCompletion(input: {
  sql: string;
  caret: number;
  completion: string;
}): { sql: string; caret: number } {
  const range = getWordRangeAt(input.sql, input.caret);
  const next = `${input.sql.slice(0, range.start)}${input.completion}${input.sql.slice(range.end)}`;
  const caret = range.start + input.completion.length;
  return { sql: next, caret };
}

/** Pixel offset of the caret inside a textarea, relative to the visible content box. */
export function measureTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  caret: number,
): { top: number; left: number } {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.font = style.font;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.tabSize = style.tabSize;

  const before = textarea.value.slice(0, Math.max(0, Math.min(caret, textarea.value.length)));
  mirror.textContent = before;
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop - textarea.scrollTop;
  const left = marker.offsetLeft - textarea.scrollLeft;
  document.body.removeChild(mirror);
  return { top, left };
}
