// FILE: DockDatabasePane.tsx
// Purpose: Right-dock host for the project database query surface (sidebar only — never navigates).
// Layer: Chat right-dock UI

import type { ProjectId } from "@synara/contracts";
import { useMemo } from "react";

import { useStore } from "~/store";
import { createProjectSelector } from "~/storeSelectors";
import { DatabaseQuerySurface } from "./DatabaseQuerySurface";

export function DockDatabasePane(props: { projectId: ProjectId | null }) {
  const project = useStore(
    useMemo(() => createProjectSelector(props.projectId), [props.projectId]),
  );

  return (
    <DatabaseQuerySurface
      mode="sidebar"
      projectId={props.projectId}
      projectName={project?.name ?? null}
    />
  );
}
