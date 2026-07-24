// FILE: threadMessagePagination.ts
// Purpose: Bound thread transcripts for composer mention context (and similar host prompts).
// Layer: Provider prompt compatibility
// Note: Extracted from the removed agent-gateway tool surface; pure pagination only.

import type { OrchestrationMessage } from "@synara/contracts";

export const THREAD_MESSAGE_PAGE_DEFAULT_LIMIT = 20;
export const THREAD_MESSAGE_PAGE_MAX_LIMIT = 100;
export const THREAD_MESSAGE_PAGE_DEFAULT_CHARS = 1500;
export const THREAD_MESSAGE_PAGE_MAX_CHARS = 20_000;

export interface ThreadMessageSummary {
  readonly index: number;
  readonly role: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly dispatchOrigin?: string;
  readonly createdAt: string;
}

export interface ThreadMessagePage {
  readonly messages: ReadonlyArray<ThreadMessageSummary>;
  readonly totalMessages: number;
  /** Pass back as `cursor` to fetch the next (older) page; absent when done. */
  readonly nextCursor?: string;
}

function truncateMessageText(
  text: string,
  maxChars: number,
): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n[... truncated ${text.length - maxChars} chars]`,
    truncated: true,
  };
}

/**
 * Page a thread's messages newest-first. `cursor` is the opaque value returned
 * by the previous page; the first call omits it and gets the tail of the
 * transcript. Message indexes are stable positions in the full transcript.
 */
export function paginateThreadMessages(input: {
  readonly messages: ReadonlyArray<OrchestrationMessage>;
  readonly cursor?: string | undefined;
  readonly messageLimit?: number | undefined;
  readonly maxMessageChars?: number | undefined;
}): ThreadMessagePage {
  const limit = Math.max(
    1,
    Math.min(
      input.messageLimit ?? THREAD_MESSAGE_PAGE_DEFAULT_LIMIT,
      THREAD_MESSAGE_PAGE_MAX_LIMIT,
    ),
  );
  const maxChars = Math.max(
    50,
    Math.min(
      input.maxMessageChars ?? THREAD_MESSAGE_PAGE_DEFAULT_CHARS,
      THREAD_MESSAGE_PAGE_MAX_CHARS,
    ),
  );
  const total = input.messages.length;
  let endExclusive = total;
  if (input.cursor !== undefined) {
    const parsed = Number.parseInt(input.cursor, 10);
    if (Number.isFinite(parsed)) {
      endExclusive = Math.max(0, Math.min(parsed, total));
    }
  }
  const startInclusive = Math.max(0, endExclusive - limit);
  const messages = input.messages.slice(startInclusive, endExclusive).map((message, offset) => {
    const { text, truncated } = truncateMessageText(message.text, maxChars);
    return {
      index: startInclusive + offset,
      role: message.role,
      text,
      truncated,
      ...(message.dispatchOrigin !== undefined ? { dispatchOrigin: message.dispatchOrigin } : {}),
      createdAt: message.createdAt,
    } satisfies ThreadMessageSummary;
  });
  return {
    messages,
    totalMessages: total,
    ...(startInclusive > 0 ? { nextCursor: String(startInclusive) } : {}),
  };
}
