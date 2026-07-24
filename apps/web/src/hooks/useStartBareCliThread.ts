// FILE: useStartBareCliThread.ts
// Purpose: Create a terminal-first thread and launch the selected provider CLI in its PTY.
// Layer: Web hooks — replaces Synara agent "new chat" as the primary new-thread path.

import type { ProjectId, ProviderKind, ThreadId } from "@synara/contracts";
import { useEffectEvent } from "react";

import { useAppSettings } from "../appSettings";
import {
  interactiveCliCommandForProvider,
  terminalIdentityForProvider,
} from "../lib/bareCliLaunch";
import { resolveSidebarNewThreadEnvMode } from "../components/Sidebar.logic";
import { runProjectCommandInTerminal } from "../projectTerminalRunner";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { useTerminalStateStore } from "../terminalStateStore";
import { DEFAULT_THREAD_TERMINAL_ID } from "../types";
import { toastManager } from "../components/ui/toast";
import { useHandleNewThread } from "./useHandleNewThread";

export function useStartBareCliThread() {
  const projects = useStore((state) => state.projects);
  const { settings } = useAppSettings();
  const { handleNewThread } = useHandleNewThread();
  const setTerminalMetadata = useTerminalStateStore((state) => state.setTerminalMetadata);

  const startBareCliThread = useEffectEvent(
    async (input: {
      projectId: ProjectId;
      provider?: ProviderKind;
      /** Override PTY cwd (e.g. Studio launches at ~). Defaults to the project cwd. */
      cwd?: string;
    }): Promise<ThreadId | null> => {
      const provider = input.provider ?? settings.defaultProvider;
      const project = projects.find((entry) => entry.id === input.projectId);
      if (!project) {
        toastManager.add({
          type: "error",
          title: "Project not found",
          description: "Pick a project before starting a CLI thread.",
        });
        return null;
      }

      const api = readNativeApi();
      if (!api) {
        toastManager.add({
          type: "error",
          title: "Not connected",
          description: "Synara is not connected to the server yet.",
        });
        return null;
      }

      const cwd = (input.cwd?.trim() || project.cwd).trim();
      const identity = terminalIdentityForProvider(provider);
      const threadId = await handleNewThread(input.projectId, {
        fresh: true,
        entryPoint: "terminal",
        provider,
        preferredTerminalCwd: cwd,
        title: identity.title,
        envMode: resolveSidebarNewThreadEnvMode({
          defaultEnvMode: settings.defaultThreadEnvMode,
        }),
      });
      if (!threadId) {
        return null;
      }

      const terminalId = DEFAULT_THREAD_TERMINAL_ID;
      const command = interactiveCliCommandForProvider(provider);
      // Seed identity before the PTY UI mounts so tabs/header don't flash generic Terminal.
      setTerminalMetadata(threadId, terminalId, {
        cliKind: identity.cliKind,
        label: identity.title,
      });
      try {
        await runProjectCommandInTerminal({
          api,
          threadId,
          terminalId,
          project: { cwd: project.cwd },
          cwd,
          command,
          cliKind: identity.cliKind,
        });
        setTerminalMetadata(threadId, terminalId, {
          cliKind: identity.cliKind,
          label: identity.title,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Unable to start CLI",
          description:
            error instanceof Error
              ? error.message
              : `Failed to launch ${command} in a terminal.`,
        });
      }
      return threadId;
    },
  );

  return { startBareCliThread };
}
