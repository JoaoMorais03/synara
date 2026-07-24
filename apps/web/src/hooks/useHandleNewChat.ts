import { ensureHomeChatProject } from "../lib/chatProjects";
import type { StartContainerChatResult } from "../lib/startContainerChat";
import { useWorkspaceStore } from "../workspaceStore";
import { useStartBareCliThread } from "./useStartBareCliThread";

export function useHandleNewChat() {
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspaceStore((state) => state.chatWorkspaceRoot);
  const { startBareCliThread } = useStartBareCliThread();

  const handleNewChat = async (_options?: {
    fresh?: boolean;
  }): Promise<StartContainerChatResult> => {
    if (!homeDir) {
      return {
        ok: false,
        error: "Home folder is not available yet.",
      };
    }

    try {
      const projectId = await ensureHomeChatProject({ homeDir, chatWorkspaceRoot });
      const threadId = await startBareCliThread({
        projectId,
        cwd: homeDir,
      });
      return { ok: true, threadId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to prepare a new chat.",
      };
    }
  };

  return { handleNewChat };
}
