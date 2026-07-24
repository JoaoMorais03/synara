// FILE: SidebarPrimaryCliAction.tsx
// Purpose: Studio "New thread" primary action — favorite CLI click, hover reveals up to 2 more.
// Layer: Sidebar UI

import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProviderStatus,
} from "@synara/contracts";
import { type ComponentType, useMemo } from "react";

import {
  bareCliProviderLabel,
  listUsableBareCliProviders,
} from "~/lib/bareCliLaunch";
import { cn } from "~/lib/utils";

import { ProviderIcon } from "./ProviderIcon";
import { SidebarGlyph } from "./sidebarGlyphs";
import { SidebarLeadingIcon } from "./SidebarLeadingIcon";
import { SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar";
import {
  SIDEBAR_HEADER_ROW_CLASS_NAME,
  SIDEBAR_ROW_ACTIVE_CLASS_NAME,
  SIDEBAR_ROW_HOVER_CLASS_NAME,
  SIDEBAR_ROW_IDLE_TEXT_CLASS_NAME,
} from "../sidebarRowStyles";

function providerLeadingIcon(provider: ProviderKind): ComponentType<{ className?: string }> {
  return function PrimaryCliProviderIcon({ className }: { className?: string }) {
    return <ProviderIcon provider={provider} className={className} />;
  };
}

export function SidebarPrimaryCliAction({
  favoriteProvider,
  providerStatuses,
  label = "New thread",
  onStart,
}: {
  favoriteProvider: ProviderKind;
  providerStatuses: readonly ServerProviderStatus[];
  label?: string;
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
  const FavoriteIcon = providerLeadingIcon(favorite);

  return (
    <SidebarMenuItem>
      <div className="group/studio-cli relative">
        <SidebarMenuButton
          size="sm"
          className={cn(
            "group/sidebar-primary-action",
            SIDEBAR_HEADER_ROW_CLASS_NAME,
            SIDEBAR_ROW_IDLE_TEXT_CLASS_NAME,
            SIDEBAR_ROW_HOVER_CLASS_NAME,
          )}
          aria-label={`Start ${bareCliProviderLabel(favorite)}`}
          title={`${PROVIDER_DISPLAY_NAMES[favorite]} → ~`}
          onClick={() => onStart(favorite)}
        >
          <SidebarLeadingIcon size="sm" tone="text-inherit">
            <SidebarGlyph icon={FavoriteIcon} variant="leading" />
          </SidebarLeadingIcon>
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
        {others.length > 0 ? (
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 right-1.5 z-20 flex -translate-y-1/2 items-center gap-0.5",
              "max-w-0 overflow-hidden opacity-0 transition-[max-width,opacity] duration-150 ease-out",
              "group-hover/studio-cli:pointer-events-auto group-hover/studio-cli:max-w-[6.5rem] group-hover/studio-cli:opacity-100",
              "group-focus-within/studio-cli:pointer-events-auto group-focus-within/studio-cli:max-w-[6.5rem] group-focus-within/studio-cli:opacity-100",
            )}
          >
            {others.map((provider) => {
              const Icon = providerLeadingIcon(provider);
              return (
                <button
                  key={provider}
                  type="button"
                  aria-label={`Start ${bareCliProviderLabel(provider)}`}
                  title={`${PROVIDER_DISPLAY_NAMES[provider]} → ~`}
                  className={cn(
                    "sidebar-icon-button inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm",
                    SIDEBAR_ROW_ACTIVE_CLASS_NAME,
                  )}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onStart(provider);
                  }}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </SidebarMenuItem>
  );
}
