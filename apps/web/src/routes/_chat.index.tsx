// FILE: _chat.index.tsx
// Purpose: Home landing — restore only the remembered home bare-CLI session when still available;
//          otherwise show a quiet empty state (never auto-pick latest leftover Groks / no spawn).
// Layer: Routing

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ThreadId } from "@synara/contracts";
import { useEffect, useMemo } from "react";

import { readSidebarUiState } from "../components/Sidebar.uiState";
import { resolveRestorableThreadRoute } from "../chatRouteRestore";
import { SplashScreen } from "../components/SplashScreen";
import { SynaraLogo } from "../components/SynaraLogo";
import { useComposerDraftStore } from "../composerDraftStore";
import { isHomeChatContainerProject } from "../lib/chatProjects";
import { EMPTY_THREAD_IDS, useStore } from "../store";
import { useSplitViewStore } from "../splitViewStore";
import {
  selectThreadTerminalState,
  useTerminalStateStore,
} from "../terminalStateStore";
import { useWorkspaceStore } from "../workspaceStore";

function HomeEmptyState() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center select-none">
        <SynaraLogo aria-label="Synara" className="size-16 text-foreground/80" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] text-foreground/90">
            Chats
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground/70">
            No sessions yet. Start a CLI from New thread in the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChatIndexRouteView() {
  const navigate = useNavigate();
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const threadIds = useStore((state) => state.threadIds ?? EMPTY_THREAD_IDS);
  const projects = useStore((state) => state.projects);
  const sidebarThreadSummaryById = useStore((state) => state.sidebarThreadSummaryById);
  const draftThreadsByThreadId = useComposerDraftStore((state) => state.draftThreadsByThreadId);
  const terminalStateByThreadId = useTerminalStateStore((state) => state.terminalStateByThreadId);
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspaceStore((state) => state.chatWorkspaceRoot);
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);

  const workspacePaths = useMemo(
    () => ({ homeDir, chatWorkspaceRoot }),
    [chatWorkspaceRoot, homeDir],
  );

  const homeChatProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const project of projects) {
      if (isHomeChatContainerProject(project, workspacePaths)) {
        ids.add(project.id);
      }
    }
    return ids;
  }, [projects, workspacePaths]);

  // Only Home-container bare CLIs — not project CLIs (MoraisEcho etc.).
  const homeCliThreadIds = threadIds.filter((threadId) => {
    const summary = sidebarThreadSummaryById[threadId];
    if (
      !summary ||
      (summary.archivedAt ?? null) !== null ||
      !homeChatProjectIds.has(summary.projectId)
    ) {
      return false;
    }
    return selectThreadTerminalState(terminalStateByThreadId, threadId).entryPoint === "terminal";
  });
  const homeThreadIdsKey = homeCliThreadIds.join(",");

  const homeTerminalDraftIdsKey = Object.entries(draftThreadsByThreadId)
    .filter(
      ([, draft]) =>
        homeChatProjectIds.has(draft.projectId) &&
        draft.entryPoint === "terminal" &&
        draft.promotedTo === undefined,
    )
    .map(([threadId]) => threadId)
    .sort()
    .join(",");

  const availableThreadIds = useMemo(() => {
    const ids = new Set<string>(homeThreadIdsKey.length > 0 ? homeThreadIdsKey.split(",") : []);
    if (homeTerminalDraftIdsKey.length > 0) {
      for (const draftThreadId of homeTerminalDraftIdsKey.split(",")) {
        ids.add(draftThreadId);
      }
    }
    return ids;
  }, [homeTerminalDraftIdsKey, homeThreadIdsKey]);

  const availableSplitViewIds = useMemo(
    () =>
      new Set(Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId])),
    [splitViewsById],
  );

  // Remembered route only — never fall back to "latest home CLI" (that dumped users into
  // leftover auto-spawned Groks after archiving a project).
  const rememberedRoute = resolveRestorableThreadRoute({
    lastThreadRoute: readSidebarUiState().lastThreadRoute,
    availableThreadIds,
    availableSplitViewIds,
  });
  const restoreThreadId = rememberedRoute?.threadId ?? null;

  useEffect(() => {
    if (!threadsHydrated || !splitViewsHydrated) {
      return;
    }

    if (!restoreThreadId) {
      return;
    }

    void navigate({
      to: "/$threadId",
      params: { threadId: ThreadId.makeUnsafe(restoreThreadId) },
      replace: true,
      search: () => ({
        splitViewId: rememberedRoute?.splitViewId,
      }),
    });
  }, [
    navigate,
    rememberedRoute?.splitViewId,
    restoreThreadId,
    splitViewsHydrated,
    threadsHydrated,
  ]);

  if (!threadsHydrated || !splitViewsHydrated) {
    return <SplashScreen />;
  }

  if (!restoreThreadId) {
    return <HomeEmptyState />;
  }

  // Restoring the remembered session — keep splash until navigation commits.
  return <SplashScreen />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
