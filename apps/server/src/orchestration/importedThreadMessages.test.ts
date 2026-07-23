// FILE: importedThreadMessages.test.ts
// Purpose: Verifies provider transcript snapshots become stable Synara import messages.
// Layer: Orchestration mapping tests
// Depends on: importedThreadMessages.

import { ThreadId } from "@synara/contracts";
import { expect, it } from "vitest";

import { mapCodexSnapshotMessages } from "./importedThreadMessages.ts";

it("maps visible Codex session items and ignores unrelated rows", () => {
  const importedAt = "2026-07-08T00:00:00.000Z";
  expect(
    mapCodexSnapshotMessages({
      threadId: ThreadId.makeUnsafe("thread-1"),
      importedAt,
      turns: [
        {
          items: [
            {
              type: "userMessage",
              text: "Question",
            },
            { type: "tool", text: "hidden" },
          ],
        },
        {
          items: [{ type: "agentMessage", text: "Answer" }],
        },
      ],
    }),
  ).toEqual([
    {
      messageId: "import:thread-1:0:0",
      role: "user",
      text: "Question",
      createdAt: importedAt,
      updatedAt: importedAt,
    },
    {
      messageId: "import:thread-1:1:0",
      role: "assistant",
      text: "Answer",
      createdAt: importedAt,
      updatedAt: importedAt,
    },
  ]);
});
