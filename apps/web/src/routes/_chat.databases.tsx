// FILE: _chat.databases.tsx
// Purpose: Full-page project database manager (opened from the project hover toolbar).
// Layer: Route
// Note: Dock Database pane is separate and must never navigate here.

import type { ProjectId } from "@synara/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  CHAT_SURFACE_HEADER_HEIGHT_CLASS,
  CHAT_SURFACE_HEADER_PADDING_X_CLASS,
} from "~/components/chat/chatHeaderControls";
import { DatabaseQuerySurface } from "~/components/database/DatabaseQuerySurface";
import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { SidebarHeaderNavigationControls } from "~/components/SidebarHeaderNavigationControls";
import { useDesktopTopBarTrafficLightGutterClassName } from "~/hooks/useDesktopTopBarGutter";
import { cn } from "~/lib/utils";
import { useStore } from "~/store";
import { createProjectSelector } from "~/storeSelectors";

export interface DatabasesSearch {
  projectId?: ProjectId;
}

export const Route = createFileRoute("/_chat/databases")({
  validateSearch: (raw): DatabasesSearch => ({
    ...(typeof raw.projectId === "string" && raw.projectId
      ? { projectId: raw.projectId as ProjectId }
      : {}),
  }),
  component: DatabasesRouteView,
});

function DatabasesRouteView() {
  const search = Route.useSearch();
  const trafficLightGutterClassName = useDesktopTopBarTrafficLightGutterClassName();
  const project = useStore(
    useMemo(() => createProjectSelector(search.projectId ?? null), [search.projectId]),
  );

  return (
    <RouteInsetSurface>
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border/60",
          CHAT_SURFACE_HEADER_HEIGHT_CLASS,
          CHAT_SURFACE_HEADER_PADDING_X_CLASS,
          trafficLightGutterClassName,
        )}
      >
        <SidebarHeaderNavigationControls />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-foreground">
            {project?.name ? `Databases · ${project.name}` : "Databases"}
          </h1>
        </div>
      </header>
      <DatabaseQuerySurface
        mode="page"
        projectId={search.projectId ?? null}
        projectName={project?.name ?? null}
      />
    </RouteInsetSurface>
  );
}
