import { type ProjectId, ThreadId } from "@synara/contracts";
import { getDefaultModel } from "@synara/shared/model";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { startTransition } from "react";
import { useAppSettings } from "../appSettings";
import {
  type ComposerThreadDraftState,
  type DraftThreadState,
  useComposerDraftStore,
} from "../composerDraftStore";
import {
  buildDraftThreadContextPatch,
  createActiveDraftThreadSnapshot,
  createActiveThreadSnapshot,
  createFreshDraftThreadSeed,
  resolveTerminalThreadCreationState,
  resolveThreadBootstrapPlan,
  type NewThreadOptions,
} from "../lib/threadBootstrap";
import { terminalIdentityForProvider } from "../lib/bareCliLaunch";
import { promoteThreadCreate } from "../lib/threadCreatePromotion";
import {
  draftNavigationSlotKey,
  runDraftNavigationOnce,
  stageDraftNavigation,
} from "../lib/stagedDraftNavigation";
import { newCommandId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useFocusedChatContext } from "../focusedChatContext";
import { useStore } from "../store";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { useTerminalStateStore } from "../terminalStateStore";
import { DEFAULT_THREAD_TERMINAL_ID } from "../types";

export interface NewThreadNavigationOptions {
  /**
   * Search params applied when the hook navigates to the created thread.
   * Lets callers keep view-level state (e.g. the editor workspace view)
   * across the route change; default navigation clears all search params.
   */
  search?: (previous: Record<string, unknown>) => Record<string, unknown>;
}

export function useHandleNewThread() {
  const projects = useStore((store) => store.projects);
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const router = useRouter();
  const { activeDraftThread, activeProjectId, activeThread, focusedThreadId, routeThreadId } =
    useFocusedChatContext();
  const openChatThreadPage = useTerminalStateStore((store) => store.openChatThreadPage);
  const openTerminalThreadPage = useTerminalStateStore((store) => store.openTerminalThreadPage);
  const openDatabaseThreadPage = useTerminalStateStore((store) => store.openDatabaseThreadPage);
  const clearTerminalState = useTerminalStateStore((store) => store.clearTerminalState);
  const markTemporaryThread = useTemporaryThreadStore((store) => store.markTemporaryThread);
  const clearTemporaryThread = useTemporaryThreadStore((store) => store.clearTemporaryThread);

  const handleNewThread = (
    projectId: ProjectId,
    options?: NewThreadOptions,
    navigation?: NewThreadNavigationOptions,
  ): Promise<ThreadId | null> => {
    const entryPoint = options?.entryPoint ?? "chat";
    const wantsTemporaryThread = options?.temporary === true;
    const applyProviderOverride = (threadId: ThreadId) => {
      if (!options?.provider) {
        return;
      }
      const defaultModel = getDefaultModel(options.provider);
      if (!defaultModel) {
        return;
      }
      setModelSelection(threadId, {
        provider: options.provider,
        model: defaultModel,
      });
    };
    const restoreComposerDraft = (
      threadId: ThreadId,
      draftState: ComposerThreadDraftState | null,
    ) => {
      if (!draftState) {
        return;
      }
      useComposerDraftStore.setState((state) => {
        if (state.draftsByThreadId[threadId] === draftState) {
          return state;
        }
        return {
          draftsByThreadId: {
            ...state.draftsByThreadId,
            [threadId]: draftState,
          },
        };
      });
    };
    const activateThreadEntryPoint = (threadId: ThreadId) => {
      if (entryPoint === "terminal") {
        const preferredTerminalCwd = options?.preferredTerminalCwd?.trim() || null;
        if (preferredTerminalCwd) {
          useTerminalStateStore.getState().setPreferredTerminalCwd(threadId, preferredTerminalCwd);
        }
        // Open the terminal page first so DEFAULT_THREAD_TERMINAL_ID exists, then seed identity
        // before navigation paints — otherwise the header flashes the project default (Codex).
        openTerminalThreadPage(threadId, { terminalOnly: true });
        if (options?.provider) {
          const identity = terminalIdentityForProvider(options.provider);
          useTerminalStateStore.getState().setTerminalMetadata(threadId, DEFAULT_THREAD_TERMINAL_ID, {
            cliKind: identity.cliKind,
            label: identity.title,
          });
        }
        return;
      }
      if (entryPoint === "database") {
        openDatabaseThreadPage(threadId);
        return;
      }
      openChatThreadPage(threadId);
    };
    const {
      getDraftThread,
      getDraftThreadByProjectId,
      applyStickyState,
      clearDraftThread,
      registerDraftThread,
      setDraftThreadContext,
      setProjectDraftThreadId,
      setModelSelection,
    } = useComposerDraftStore.getState();
    const shouldForceFreshThread = options?.fresh === true;

    const storedDraftThreadCandidate = getDraftThreadByProjectId(projectId, entryPoint);
    const latestActiveDraftThreadCandidate: DraftThreadState | null = focusedThreadId
      ? getDraftThread(focusedThreadId)
      : null;
    const storedDraftThread =
      !shouldForceFreshThread &&
      !wantsTemporaryThread &&
      storedDraftThreadCandidate?.isTemporary !== true
        ? storedDraftThreadCandidate
        : null;
    const latestActiveDraftThread: DraftThreadState | null =
      !shouldForceFreshThread &&
      !wantsTemporaryThread &&
      latestActiveDraftThreadCandidate?.isTemporary !== true
        ? latestActiveDraftThreadCandidate
        : null;
    const bootstrapPlan = resolveThreadBootstrapPlan({
      storedDraftThread,
      latestActiveDraftThread,
      entryPoint,
      projectId,
      routeThreadId: focusedThreadId,
    });
    // Read from the store at call time so post-sync sidebar flows can use the latest project defaults.
    const projectDefaultModelSelection =
      useStore.getState().projects.find((project) => project.id === projectId)
        ?.defaultModelSelection ?? null;
    const activeThreadSnapshot = createActiveThreadSnapshot(activeThread, projectId);
    const activeDraftThreadSnapshot = createActiveDraftThreadSnapshot(activeDraftThread, projectId);
    const resolveCreationState = (
      targetThreadId: ThreadId,
      draftThread: DraftThreadState | null,
      creationOptions: NewThreadOptions | undefined,
    ) =>
      resolveTerminalThreadCreationState({
        activeDraftThread: activeDraftThreadSnapshot,
        activeThread: activeThreadSnapshot,
        defaultProvider: options?.provider ?? settings.defaultProvider,
        draftComposerState:
          useComposerDraftStore.getState().draftsByThreadId[targetThreadId] ?? null,
        draftThread,
        options: creationOptions,
        projectDefaultModelSelection,
        projectId,
      });
    // Terminal/database-first threads need a real orchestration thread immediately so
    // the sidebar can render them as durable rows instead of draft-only routes.
    const promotePrimarySurfaceThread = async (
      threadId: ThreadId,
      creationState: ReturnType<typeof resolveCreationState>,
      title: string,
    ): Promise<void> => {
      const api = readNativeApi();
      if (!api) {
        return;
      }
      await promoteThreadCreate(
        {
          type: "thread.create",
          commandId: newCommandId(),
          threadId,
          projectId,
          title,
          modelSelection: creationState.modelSelection,
          runtimeMode: creationState.runtimeMode,
          interactionMode: creationState.interactionMode,
          envMode: creationState.envMode,
          branch: creationState.branch,
          worktreePath: creationState.worktreePath,
          lastKnownPr: creationState.lastKnownPr,
          createdAt: new Date().toISOString(),
        },
        api,
      );
    };
    const createTerminalThread = (
      threadId: ThreadId,
      creationState: ReturnType<typeof resolveCreationState>,
    ) =>
      promotePrimarySurfaceThread(
        threadId,
        creationState,
        options?.title?.trim() ||
          (options?.provider
            ? terminalIdentityForProvider(options.provider).title
            : "New terminal"),
      );
    const createDatabaseThread = (
      threadId: ThreadId,
      creationState: ReturnType<typeof resolveCreationState>,
    ) => promotePrimarySurfaceThread(threadId, creationState, "New database");
    const promoteEntryPointThread = async (
      threadId: ThreadId,
      draftThread: DraftThreadState | null,
      creationOptions: NewThreadOptions | undefined,
    ): Promise<void> => {
      if (entryPoint === "terminal") {
        await createTerminalThread(
          threadId,
          resolveCreationState(threadId, draftThread, creationOptions),
        );
        return;
      }
      if (entryPoint === "database") {
        await createDatabaseThread(
          threadId,
          resolveCreationState(threadId, draftThread, creationOptions),
        );
      }
    };
    if (bootstrapPlan.kind === "stored") {
      return (async (): Promise<ThreadId> => {
        if (wantsTemporaryThread) {
          markTemporaryThread(bootstrapPlan.threadId);
        }
        const preservedComposerDraft =
          useComposerDraftStore.getState().draftsByThreadId[bootstrapPlan.threadId] ?? null;
        let resolvedStoredDraftThread: DraftThreadState | null = bootstrapPlan.draftThread;
        const shouldPreserveStoredSurfaceContext =
          (entryPoint === "terminal" || entryPoint === "database") &&
          bootstrapPlan.draftThread.entryPoint === entryPoint;
        const draftContextPatch = shouldPreserveStoredSurfaceContext
          ? null
          : buildDraftThreadContextPatch(entryPoint, options);
        const creationOptions = shouldPreserveStoredSurfaceContext ? undefined : options;
        if (draftContextPatch) {
          setDraftThreadContext(bootstrapPlan.threadId, draftContextPatch);
          resolvedStoredDraftThread = getDraftThread(bootstrapPlan.threadId);
        }
        applyProviderOverride(bootstrapPlan.threadId);
        setProjectDraftThreadId(projectId, bootstrapPlan.threadId, { entryPoint });
        restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
        activateThreadEntryPoint(bootstrapPlan.threadId);
        if (focusedThreadId === bootstrapPlan.threadId) {
          await promoteEntryPointThread(
            bootstrapPlan.threadId,
            resolvedStoredDraftThread,
            creationOptions,
          );
          return bootstrapPlan.threadId;
        }
        await navigate({
          to: "/$threadId",
          params: { threadId: bootstrapPlan.threadId },
          ...(navigation?.search ? { search: navigation.search } : {}),
        });
        restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
        await promoteEntryPointThread(
          bootstrapPlan.threadId,
          resolvedStoredDraftThread,
          creationOptions,
        );
        return bootstrapPlan.threadId;
      })();
    }

    if (bootstrapPlan.kind === "route") {
      return (async (): Promise<ThreadId> => {
        if (wantsTemporaryThread) {
          markTemporaryThread(bootstrapPlan.threadId);
        }
        const preservedComposerDraft =
          useComposerDraftStore.getState().draftsByThreadId[bootstrapPlan.threadId] ?? null;
        let resolvedActiveDraftThread: DraftThreadState | null = bootstrapPlan.draftThread;
        const draftContextPatch = buildDraftThreadContextPatch(entryPoint, options);
        if (draftContextPatch) {
          setDraftThreadContext(bootstrapPlan.threadId, draftContextPatch);
          resolvedActiveDraftThread = getDraftThread(bootstrapPlan.threadId);
        }
        applyProviderOverride(bootstrapPlan.threadId);
        setProjectDraftThreadId(projectId, bootstrapPlan.threadId, { entryPoint });
        restoreComposerDraft(bootstrapPlan.threadId, preservedComposerDraft);
        activateThreadEntryPoint(bootstrapPlan.threadId);
        await promoteEntryPointThread(bootstrapPlan.threadId, resolvedActiveDraftThread, options);
        return bootstrapPlan.threadId;
      })();
    }

    return runDraftNavigationOnce(draftNavigationSlotKey(projectId, entryPoint), async () => {
      const threadId = newThreadId();
      if (wantsTemporaryThread) {
        markTemporaryThread(threadId);
      }
      const createdAt = new Date().toISOString();
      const draftSeed = createFreshDraftThreadSeed({ createdAt, entryPoint, options });
      const committed = await stageDraftNavigation({
        // Keep the previous routed draft alive while the destination loads. Replacing the
        // project's primary slot earlier makes the route guard redirect the old URL to Home.
        stage: () => {
          registerDraftThread(threadId, { projectId, ...draftSeed });
          activateThreadEntryPoint(threadId);
          applyStickyState(threadId);
          applyProviderOverride(threadId);
        },
        // Mark the draft-landing navigation as a transition so the new route
        // subtree renders interruptibly and the browser can paint the composer
        // skeleton immediately instead of freezing on the synchronous commit.
        navigate: () =>
          new Promise<void>((resolve, reject) => {
            startTransition(() => {
              navigate({
                to: "/$threadId",
                params: { threadId },
                ...(navigation?.search ? { search: navigation.search } : {}),
              }).then(resolve, reject);
            });
          }),
        // TanStack resolves an older navigate() promise when a newer navigation supersedes it.
        // Verify the committed route before deleting the previous project draft.
        isDestinationActive: () => router.state.location.pathname === `/${threadId}`,
        finalize: () => setProjectDraftThreadId(projectId, threadId, draftSeed),
        rollback: () => {
          clearDraftThread(threadId);
          clearTerminalState(threadId);
          if (wantsTemporaryThread) {
            clearTemporaryThread(threadId);
          }
        },
      });
      if (!committed) {
        return null;
      }
      await promoteEntryPointThread(threadId, getDraftThread(threadId), options);
      return threadId;
    });
  };

  return {
    activeDraftThread,
    activeProjectId,
    activeThread,
    activeContextThreadId: focusedThreadId,
    handleNewThread,
    projects,
    routeThreadId,
  };
}
