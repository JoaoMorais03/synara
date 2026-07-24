// FILE: projectTerminalRunner.ts
// Purpose: Shared helper for launching project commands in managed terminal sessions.
// Layer: Web terminal orchestration helper
// Exports: runProjectCommandInTerminal and default dimensions for script terminals.

import type { NativeApi, TerminalSessionSnapshot, ThreadId } from "@synara/contracts";
import {
  deriveTerminalCommandIdentity,
  SYNARA_TERMINAL_CLI_KIND_ENV_KEY,
  type TerminalCliKind,
} from "@synara/shared/terminalThreads";

import { projectScriptRuntimeEnv } from "./projectScripts";

export const PROJECT_COMMAND_TERMINAL_COLS = 120;
export const PROJECT_COMMAND_TERMINAL_ROWS = 30;

export interface ProjectCommandTerminalMetadata {
  cliKind: TerminalCliKind | null;
  label: string;
}

export async function runProjectCommandInTerminal(input: {
  api: NativeApi;
  threadId: ThreadId;
  terminalId: string;
  project: { cwd: string };
  cwd: string;
  command: string;
  worktreePath?: string | null;
  env?: Record<string, string>;
  /** Force PTY identity even before the CLI process is detected. */
  cliKind?: TerminalCliKind | null;
}): Promise<{
  snapshot: TerminalSessionSnapshot;
  metadata: ProjectCommandTerminalMetadata | null;
}> {
  const terminalCommandIdentity = deriveTerminalCommandIdentity(input.command);
  const cliKind = input.cliKind ?? terminalCommandIdentity?.cliKind ?? null;
  const runtimeEnv = projectScriptRuntimeEnv({
    project: {
      cwd: input.project.cwd,
    },
    worktreePath: input.worktreePath ?? null,
    extraEnv: {
      ...(cliKind ? { [SYNARA_TERMINAL_CLI_KIND_ENV_KEY]: cliKind } : {}),
      ...(input.env ?? {}),
    },
  });
  let snapshot = await input.api.terminal.open({
    threadId: input.threadId,
    terminalId: input.terminalId,
    cwd: input.cwd,
    env: runtimeEnv,
    cols: PROJECT_COMMAND_TERMINAL_COLS,
    rows: PROJECT_COMMAND_TERMINAL_ROWS,
  });

  // ChatView often opens the default terminal at the project cwd first. Re-open
  // requests ignore cwd changes on a live PTY, so restart when we need a different root.
  if (snapshot.cwd !== input.cwd) {
    snapshot = await input.api.terminal.restart({
      threadId: input.threadId,
      terminalId: input.terminalId,
      cwd: input.cwd,
      env: runtimeEnv,
      cols: PROJECT_COMMAND_TERMINAL_COLS,
      rows: PROJECT_COMMAND_TERMINAL_ROWS,
    });
  }

  await input.api.terminal.write({
    threadId: input.threadId,
    terminalId: input.terminalId,
    data: `${input.command}\r`,
  });

  return {
    snapshot,
    metadata: terminalCommandIdentity
      ? {
          cliKind: terminalCommandIdentity.cliKind,
          label: terminalCommandIdentity.title,
        }
      : cliKind
        ? {
            cliKind,
            label: cliKind,
          }
        : null,
  };
}
