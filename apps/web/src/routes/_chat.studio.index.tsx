// FILE: _chat.studio.index.tsx
// Purpose: Studio landing — restore an existing bare-CLI Studio session when one exists;
//          otherwise show a quiet empty state (do not auto-spawn a CLI or revive agent drafts).
// Layer: Routing

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectId, ThreadId } from "@synara/contracts";
import { useEffect, useState } from "react";

import { useAppSettings } from "../appSettings";
import { sortThreadsForSidebar } from "../components/Sidebar.logic";
import { readSidebarUiState } from "../components/Sidebar.uiState";
import { resolveRestorableThreadRoute } from "../chatRouteRestore";
import { SplashScreen } from "../components/SplashScreen";
import { SynaraLogo } from "../components/SynaraLogo";
import { useComposerDraftStore } from "../composerDraftStore";
import { collectStudioProjectIds } from "../lib/studioProjects";
import { EMPTY_THREAD_IDS, useStore } from "../store";
import { useSplitViewStore } from "../splitViewStore";
import {
  selectThreadTerminalState,
  useTerminalStateStore,
} from "../terminalStateStore";
import { useWorkspaceStore } from "../workspaceStore";

const WORKSPACE_PATHS_TIMEOUT_MS = 10_000;

function StudioEmptyState() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center select-none">
        <SynaraLogo aria-label="Synara" className="size-16 text-foreground/80" />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[18px] font-medium tracking-[-0.01em] text-foreground/90">
            Studio
          </h2>
          <p className="text-[13px] leading-5 text-muted-foreground/70">
            No sessions yet. Start a CLI from New thread in the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}

function StudioIndexRouteView() {
  const { settings: appSettings } = useAppSettings();
  const navigate = useNavigate();
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const threadIds = useStore((state) => state.threadIds ?? EMPTY_THREAD_IDS);
  const projects = useStore((state) => state.projects);
  const sidebarThreadSummaryById = useStore((state) => state.sidebarThreadSummaryById);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (state) => state.clearProjectDraftThreadId,
  );
  const terminalStateByThreadId = useTerminalStateStore((state) => state.terminalStateByThreadId);
  const homeDir = useWorkspaceStore((state) => state.homeDir);
  const chatWorkspaceRoot = useWorkspaceStore((state) => state.chatWorkspaceRoot);
  const studioWorkspaceRoot = useWorkspaceStore((state) => state.studioWorkspaceRoot);
  const splitViewsHydrated = useSplitViewStore((state) => state.hasHydrated);
  const splitViewsById = useSplitViewStore((state) => state.splitViewsById);

  const studioSectionVisible = appSettings.showStudioSection;
  useEffect(() => {
    if (!studioSectionVisible) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, studioSectionVisible]);

  const [pathsWaitTimedOut, setPathsWaitTimedOut] = useState(false);
  useEffect(() => {
    if (studioWorkspaceRoot || pathsWaitTimedOut) {
      return;
    }
    const timer = window.setTimeout(() => setPathsWaitTimedOut(true), WORKSPACE_PATHS_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pathsWaitTimedOut, studioWorkspaceRoot]);

  const studioProjectIds = collectStudioProjectIds(projects, {
    homeDir,
    chatWorkspaceRoot,
    studioWorkspaceRoot,
  });
  const studioProjectIdsKey = [...studioProjectIds].sort().join(",");
  // Studio is bare-CLI only — ignore agent-chat drafts/threads so empty Studio stays empty.
  const studioCliThreadSummaries = threadIds.flatMap((threadId) => {
    const summary = sidebarThreadSummaryById[threadId];
    if (
      !summary ||
      (summary.archivedAt ?? null) !== null ||
      !studioProjectIds.has(summary.projectId)
    ) {
      return [];
    }
    const entryPoint = selectThreadTerminalState(terminalStateByThreadId, threadId).entryPoint;
    return entryPoint === "terminal" ? [summary] : [];
  });
  const studioThreadIdsKey = studioCliThreadSummaries.map((row) => row.id).join(",");
  const latestStudioThreadId =
    sortThreadsForSidebar(studioCliThreadSummaries, appSettings.sidebarThreadSortOrder)[0]?.id ??
    null;

  // Drop stale Studio agent-chat drafts so they can't revive composer landings.
  useEffect(() => {
    if (!threadsHydrated || studioProjectIdsKey.length === 0) {
      return;
    }
    for (const projectId of studioProjectIdsKey.split(",")) {
      clearProjectDraftThreadId(ProjectId.makeUnsafe(projectId), "chat");
    }
  }, [clearProjectDraftThreadId, studioProjectIdsKey, threadsHydrated]);

  useEffect(() => {
    if (!studioSectionVisible || !threadsHydrated || !splitViewsHydrated || !studioWorkspaceRoot) {
      return;
    }

    const availableThreadIds = new Set(
      studioThreadIdsKey.length > 0 ? studioThreadIdsKey.split(",") : [],
    );
    const rememberedRoute = resolveRestorableThreadRoute({
      lastThreadRoute: readSidebarUiState().lastThreadRoute,
      availableThreadIds,
      availableSplitViewIds: new Set(
        Object.keys(splitViewsById).filter((splitViewId) => splitViewsById[splitViewId]),
      ),
    });
    const restoreThreadId = rememberedRoute?.threadId ?? latestStudioThreadId ?? null;

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
    latestStudioThreadId,
    navigate,
    splitViewsById,
    splitViewsHydrated,
    studioSectionVisible,
    studioThreadIdsKey,
    studioWorkspaceRoot,
    threadsHydrated,
  ]);

  if (!studioSectionVisible) {
    return <SplashScreen />;
  }

  if (!studioWorkspaceRoot) {
    return (
      <SplashScreen
        errorMessage={
          pathsWaitTimedOut
            ? "Studio is taking too long to load — the server has not reported its Studio folder yet."
            : null
        }
        onRetry={pathsWaitTimedOut ? () => setPathsWaitTimedOut(false) : null}
      />
    );
  }

  if (!threadsHydrated || !splitViewsHydrated) {
    return <SplashScreen />;
  }

  if (studioCliThreadSummaries.length === 0) {
    return <StudioEmptyState />;
  }

  // Restoring an existing session — keep splash until navigation commits.
  return <SplashScreen />;
}

export const Route = createFileRoute("/_chat/studio/")({
  component: StudioIndexRouteView,
});
