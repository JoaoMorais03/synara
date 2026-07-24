// FILE: useHandleNewStudioChat.ts
// Purpose: Starts a bare CLI thread inside the hidden Studio project container.
// Layer: Web hook
// Exports: useHandleNewStudioChat

import { ensureStudioProject } from "../lib/studioProjects";
import type { StartContainerChatResult } from "../lib/startContainerChat";
import { useWorkspaceStore } from "../workspaceStore";
import { useStartBareCliThread } from "./useStartBareCliThread";

export function useHandleNewStudioChat() {
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspaceStore((state) => state.chatWorkspaceRoot);
  const studioWorkspaceRoot = useWorkspaceStore((state) => state.studioWorkspaceRoot);
  const { startBareCliThread } = useStartBareCliThread();

  const handleNewStudioChat = async (_options?: {
    fresh?: boolean;
  }): Promise<StartContainerChatResult> => {
    if (!homeDir) {
      return {
        ok: false,
        error: "Home folder is not available yet.",
      };
    }

    try {
      const projectId = await ensureStudioProject({
        homeDir,
        chatWorkspaceRoot,
        studioWorkspaceRoot,
      });
      const threadId = await startBareCliThread({
        projectId,
        cwd: homeDir,
      });
      return { ok: true, threadId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to prepare a new Studio chat.",
      };
    }
  };

  return { handleNewStudioChat };
}
