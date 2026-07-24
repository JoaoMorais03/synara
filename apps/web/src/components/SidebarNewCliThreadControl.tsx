// FILE: SidebarNewCliThreadControl.tsx
// Purpose: Friday-style new-thread control — click launches favorite CLI; hover reveals other CLIs.
// Layer: Sidebar UI

import {
  PROVIDER_DISPLAY_NAMES,
  type ProjectId,
  type ProviderKind,
  type ServerProviderStatus,
} from "@synara/contracts";
import { type ComponentType, useMemo } from "react";

import { ProviderIcon } from "./ProviderIcon";
import { SidebarIconButton } from "./SidebarIconButton";
import {
  bareCliProviderLabel,
  listUsableBareCliProviders,
} from "~/lib/bareCliLaunch";
import { cn } from "~/lib/utils";

function providerSidebarIcon(provider: ProviderKind): ComponentType<{ className?: string }> {
  return function BareCliProviderIcon({ className }: { className?: string }) {
    return <ProviderIcon provider={provider} className={className} />;
  };
}

export function SidebarNewCliThreadControl({
  projectId: _projectId,
  projectName,
  favoriteProvider,
  providerStatuses,
  shortcutLabel,
  onStart,
}: {
  projectId: ProjectId;
  projectName: string;
  favoriteProvider: ProviderKind;
  providerStatuses: readonly ServerProviderStatus[];
  shortcutLabel?: string | null;
  onStart: (provider: ProviderKind) => void;
}) {
  const providers = useMemo(
    () =>
      listUsableBareCliProviders({
        statuses: providerStatuses,
        favoriteProvider,
      }),
    [favoriteProvider, providerStatuses],
  );

  const favorite = providers[0] ?? favoriteProvider;
  const others = providers.filter((provider) => provider !== favorite);

  return (
    <div
      className={cn(
        "group/cli-new relative flex items-center gap-0.5",
        others.length > 0 && "hover:gap-1",
      )}
      data-testid="new-cli-thread-control"
    >
      <div
        className={cn(
          "flex max-w-0 items-center gap-0.5 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 ease-out",
          "group-hover/cli-new:max-w-[7.5rem] group-hover/cli-new:opacity-100",
          "group-focus-within/cli-new:max-w-[7.5rem] group-focus-within/cli-new:opacity-100",
        )}
      >
        {others.map((provider) => (
          <SidebarIconButton
            key={provider}
            icon={providerSidebarIcon(provider)}
            label={`Start ${bareCliProviderLabel(provider)} in ${projectName}`}
            tooltip={PROVIDER_DISPLAY_NAMES[provider]}
            tooltipSide="top"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onStart(provider);
            }}
          />
        ))}
      </div>
      <SidebarIconButton
        icon={providerSidebarIcon(favorite)}
        label={`Start ${bareCliProviderLabel(favorite)} in ${projectName}`}
        tooltip={
          shortcutLabel
            ? `${PROVIDER_DISPLAY_NAMES[favorite]} (${shortcutLabel})`
            : PROVIDER_DISPLAY_NAMES[favorite]
        }
        tooltipSide="top"
        data-testid="new-thread-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStart(favorite);
        }}
      />
    </div>
  );
}
