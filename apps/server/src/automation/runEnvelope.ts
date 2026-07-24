// FILE: runEnvelope.ts
// Purpose: Builds the single canonical synthetic message sent to automation runs.

import type { AutomationDefinition, AutomationRun } from "@synara/contracts";

export const AUTOMATION_MEMORY_INJECTION_MAX_BYTES = 8 * 1_024;
export const AUTOMATION_MEMORY_TRUNCATION_MARKER = "[... older automation memory truncated ...]\n";

export function automationMemoryForEnvelope(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  if (bytes.byteLength <= AUTOMATION_MEMORY_INJECTION_MAX_BYTES) {
    return content || "(empty)";
  }

  const marker = Buffer.from(AUTOMATION_MEMORY_TRUNCATION_MARKER, "utf8");
  const suffixBudget = AUTOMATION_MEMORY_INJECTION_MAX_BYTES - marker.byteLength;
  let start = Math.max(0, bytes.byteLength - suffixBudget);
  while (start < bytes.byteLength && (bytes[start]! & 0xc0) === 0x80) {
    start += 1;
  }
  return `${AUTOMATION_MEMORY_TRUNCATION_MARKER}${bytes.subarray(start).toString("utf8")}`;
}

function iterationLabel(definition: AutomationDefinition, run: AutomationRun): string {
  const iteration = run.permissionSnapshot.iterationNumber ?? definition.iterationCount + 1;
  return `${iteration}/${definition.maxIterations ?? "∞"}`;
}

function runContext(mode: AutomationDefinition["mode"]): string {
  if (mode === "heartbeat") {
    return [
      "This is a scheduled Synara automation heartbeat.",
      "Complete the task using your normal CLI tools only.",
      "There is no Synara MCP / synara_* tool surface — do not attempt to call one.",
    ].join(" ");
  }
  return [
    "This is a scheduled Synara automation run.",
    "Complete the task using your normal CLI tools only.",
    "There is no Synara MCP / synara_* tool surface — do not attempt to call one.",
  ].join(" ");
}

export function buildAutomationRunEnvelope(input: {
  readonly definition: AutomationDefinition;
  readonly run: AutomationRun;
  readonly memoryContent: string;
  readonly lastRunAt: string | null;
}): string {
  const { definition, run } = input;
  return [
    `Automation: ${definition.name}`,
    `Automation ID: ${definition.id}`,
    `Run: ${run.trigger.type}, scheduled for ${run.scheduledFor} (last run: ${
      input.lastRunAt ?? "never"
    }, iteration ${iterationLabel(definition, run)})`,
    "Memory (context from previous runs; read-only in this harness — do not call Synara tools to update it):",
    automationMemoryForEnvelope(input.memoryContent),
    "",
    runContext(definition.mode),
    "",
    "---",
    "",
    definition.prompt,
  ].join("\n");
}
