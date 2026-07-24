// FILE: SqlEditor.tsx
// Purpose: Code-style SQL editor with gutter line numbers, highlight, autocomplete.
// Layer: Database UI

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "~/lib/utils";
import {
  applyCompletion,
  getWordRangeAt,
  highlightSqlToHtml,
  measureTextareaCaretOffset,
  suggestSqlCompletions,
} from "./sqlEditor.logic";

export type SqlEditorHandle = {
  /** Selection when non-empty, otherwise the full buffer. */
  getSqlToRun: () => string;
};

const LINE_HEIGHT_PX = 20; // text-[12px] leading-5
const PAD_Y_PX = 10; // p-2.5
const PAD_X_PX = 10;

export const SqlEditor = forwardRef<
  SqlEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    /** Called with the selection when non-empty, otherwise the full buffer. */
    onRun: (sqlToRun: string) => void;
    compact?: boolean;
    /** Fill the parent height (used when the editor owns the pane before first query). */
    fill?: boolean;
    extraWords?: readonly string[];
    className?: string;
    placeholder?: string;
  }
>(function SqlEditor(props, ref) {
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const lineCount = useMemo(() => Math.max(1, props.value.split("\n").length), [props.value]);

  const activeLine = useMemo(() => {
    let line = 1;
    const limit = Math.min(caret, props.value.length);
    for (let i = 0; i < limit; i++) {
      if (props.value[i] === "\n") {
        line += 1;
      }
    }
    return line;
  }, [props.value, caret]);

  const gutterDigits = Math.max(2, String(lineCount).length);

  const suggestions = useMemo(
    () =>
      suggestSqlCompletions({
        sql: props.value,
        caret,
        ...(props.extraWords ? { extraWords: props.extraWords } : {}),
      }),
    [props.value, caret, props.extraWords],
  );

  const highlighted = useMemo(() => highlightSqlToHtml(props.value), [props.value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.join("|")]);

  const syncScroll = () => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    const gutter = gutterRef.current;
    if (!textarea) {
      return;
    }
    if (mirror) {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    }
    if (gutter) {
      gutter.scrollTop = textarea.scrollTop;
    }
  };

  const updateMenuPosition = (nextCaret = caret) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMenuPos(null);
      return;
    }
    const offset = measureTextareaCaretOffset(textarea, nextCaret);
    setMenuPos({
      top: Math.max(0, offset.top + LINE_HEIGHT_PX),
      left: Math.max(8, offset.left),
    });
  };

  useLayoutEffect(() => {
    if (!menuOpen || suggestions.length === 0) {
      return;
    }
    updateMenuPosition(caret);
  }, [menuOpen, caret, props.value, suggestions.length]);

  const resolveSqlToRun = (): string => {
    const el = textareaRef.current;
    if (!el) {
      return props.value;
    }
    const { selectionStart, selectionEnd } = el;
    if (selectionStart !== selectionEnd) {
      return props.value.slice(selectionStart, selectionEnd);
    }
    return props.value;
  };

  useImperativeHandle(ref, () => ({
    getSqlToRun: resolveSqlToRun,
  }));

  const insertRawText = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${props.value.slice(0, start)}${text}${props.value.slice(end)}`;
    const nextCaret = start + text.length;
    props.onChange(next);
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const commitSuggestion = (completion: string) => {
    const next = applyCompletion({
      sql: props.value,
      caret,
      completion,
    });
    props.onChange(next.sql);
    setCaret(next.caret);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  const minHeightClass = props.fill ? "h-full min-h-0" : props.compact ? "min-h-24" : "min-h-32";
  const shellClass = props.fill
    ? "h-full min-h-0"
    : props.compact
      ? "min-h-24"
      : "min-h-32";

  return (
    <div className={cn("relative flex min-h-0 flex-col", props.fill && "h-full", props.className)}>
      <div
        ref={shellRef}
        className={cn(
          "flex min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-[color-mix(in_oklab,var(--color-background)_92%,black)] font-mono text-[12px] leading-5 shadow-inner",
          shellClass,
        )}
      >
        {/* Line-number gutter — IDE-style, muted, scrolls with the buffer */}
        <div
          ref={gutterRef}
          aria-hidden
          className="h-full shrink-0 select-none overflow-hidden border-r border-border/50 bg-muted/20"
          style={{
            width: `calc(${gutterDigits}ch + 1.25rem)`,
            paddingTop: PAD_Y_PX,
            paddingBottom: PAD_Y_PX,
          }}
        >
          <div className="flex flex-col">
            {Array.from({ length: lineCount }, (_, index) => {
              const line = index + 1;
              const isActive = line === activeLine;
              return (
                <div
                  key={line}
                  className={cn(
                    "pr-2 text-right tabular-nums leading-5",
                    isActive
                      ? "text-muted-foreground/90"
                      : "text-muted-foreground/40",
                  )}
                  style={{ height: LINE_HEIGHT_PX }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        {/* Code surface */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <pre
            ref={mirrorRef}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 m-0 overflow-auto whitespace-pre-wrap text-[12px] leading-5",
              "[&_.sql-keyword]:font-semibold [&_.sql-keyword]:text-sky-400",
              "[&_.sql-string]:text-emerald-400/90",
              "[&_.sql-number]:text-amber-300/90",
              "[&_.sql-comment]:text-muted-foreground/55 [&_.sql-comment]:italic",
              "[&_.sql-ident]:text-foreground/90",
            )}
            style={{ padding: `${PAD_Y_PX}px ${PAD_X_PX}px` }}
            dangerouslySetInnerHTML={{
              __html:
                highlighted ||
                `<span class="text-muted-foreground/45">${props.placeholder ?? ""}</span>`,
            }}
          />
          <textarea
            ref={textareaRef}
            value={props.value}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            aria-label="SQL"
            placeholder={props.placeholder}
            className={cn(
              "relative z-10 block h-full w-full resize-none bg-transparent font-mono text-[12px] leading-5 text-transparent caret-foreground outline-none",
              "whitespace-pre-wrap selection:bg-sky-500/30",
              minHeightClass,
            )}
            style={{ padding: `${PAD_Y_PX}px ${PAD_X_PX}px` }}
            onScroll={() => {
              syncScroll();
              if (menuOpen) {
                updateMenuPosition();
              }
            }}
            onChange={(event) => {
              props.onChange(event.target.value);
              const nextCaret = event.target.selectionStart;
              setCaret(nextCaret);
              const word = getWordRangeAt(event.target.value, nextCaret).word;
              setMenuOpen(word.length > 0);
              if (word.length > 0) {
                updateMenuPosition(nextCaret);
              }
            }}
            onClick={(event) => {
              const nextCaret = event.currentTarget.selectionStart;
              setCaret(nextCaret);
              if (menuOpen) {
                updateMenuPosition(nextCaret);
              }
            }}
            onKeyUp={(event) => {
              const nextCaret = event.currentTarget.selectionStart;
              setCaret(nextCaret);
              if (menuOpen) {
                updateMenuPosition(nextCaret);
              }
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                props.onRun(resolveSqlToRun());
                return;
              }

              if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                insertRawText(" ");
                setMenuOpen(false);
                return;
              }

              if (event.key === " " && event.ctrlKey) {
                event.preventDefault();
                setMenuOpen(true);
                updateMenuPosition(event.currentTarget.selectionStart);
                return;
              }

              if (menuOpen && suggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => (index + 1) % suggestions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  commitSuggestion(suggestions[activeIndex] ?? suggestions[0]!);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMenuOpen(false);
                }
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setMenuOpen(false), 120);
            }}
          />

          {menuOpen && suggestions.length > 0 && menuPos ? (
            <ul
              className="absolute z-30 max-h-40 min-w-[8rem] max-w-[16rem] overflow-auto rounded-md border border-border bg-popover py-1 text-xs shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
              role="listbox"
            >
              {suggestions.map((item, index) => (
                <li key={item}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full px-2.5 py-1 text-left font-mono",
                      index === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-muted/70",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      commitSuggestion(item);
                    }}
                  >
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {!props.fill ? (
        <p className="mt-1 shrink-0 text-[10px] text-muted-foreground">
          ⌘/Ctrl+Enter run selection or all · Ctrl+Space suggestions · Tab accept
        </p>
      ) : (
        <p className="mt-1 shrink-0 text-[10px] text-muted-foreground">
          ⌘/Ctrl+Enter run · first query opens the result grid below
        </p>
      )}
    </div>
  );
});
