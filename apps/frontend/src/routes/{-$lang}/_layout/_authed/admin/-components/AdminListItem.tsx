import { LucideMoreVertical } from "lucide-react";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { UnpublishedDot } from "./UnpublishedDot";

interface AdminListItemTranslation {
  lang: string;
  statuses: {
    published?: string;
    draft?: string;
    review?: string;
  };
}

export interface AdminListItemMenuItem {
  label: ReactNode;
  onSelect: () => void;
  variant?: "default" | "destructive";
}

export function AdminListItem({
  id,
  header,
  meta,
  translations,
  menuItems = [],
  hideUnpublishedDot,
}: {
  id: string;
  header?: string;
  meta?: ReactNode;
  translations: AdminListItemTranslation[];
  menuItems?: AdminListItemMenuItem[];
  hideUnpublishedDot?: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2 text-foreground-light text-xs group-data-[active=true]:text-white/80">
          {header ?? id} {meta ? <div className="mt-1">{meta}</div> : null}
        </div>

        <ul className="space-y-0.5">
          {translations.map((translation) => {
            const publishedTitle = translation.statuses.published;
            const draftTitle = translation.statuses.draft;
            const reviewTitle = translation.statuses.review;
            const displayTitle = publishedTitle || draftTitle || reviewTitle;

            const hasChangedDraft = !!draftTitle && draftTitle !== publishedTitle;

            if (!displayTitle) return null;

            return (
              <li
                key={translation.lang}
                className="flex min-w-0 items-center justify-between gap-2 text-xs"
              >
                <span className="truncate text-sm">{displayTitle}</span>
                {hasChangedDraft && !hideUnpublishedDot ? <UnpublishedDot /> : null}
              </li>
            );
          })}
        </ul>
      </div>
      {menuItems.length === 0 ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={"ghost"} size={"icon"}>
              <LucideMoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              {menuItems.map((item, index) => (
                <DropdownMenuItem
                  key={index}
                  variant={item.variant}
                  onClick={(e) => {
                    e.stopPropagation();
                    item.onSelect();
                  }}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
