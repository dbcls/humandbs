import { LucideMoreVertical } from "lucide-react";

import type { ReactNode } from "react";

import type { RESEARCH_STATUS } from "@humandbs/backend/types";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "@/config/i18n";
import { cn } from "@/lib/utils";
import type { DocumentListItemTranslation } from "@/repositories/document";

import { UnpublishedDot } from "./UnpublishedDot";

type AdminListItemTranslation =
  | DocumentListItemTranslation
  | {
      status: (typeof RESEARCH_STATUS)[number];
      lang: Locale;
      title: string | undefined;
    };

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
            return (
              <li
                key={translation.lang}
                className="flex min-w-0 items-center justify-between gap-2 text-xs"
              >
                <span
                  className={cn("truncate text-sm", {
                    "text-gray-400 italic": translation.status === "draft",
                  })}
                >
                  {translation.title}
                </span>
                {translation.status === "published" &&
                "hasUnpublishedChanges" in translation &&
                translation.hasUnpublishedChanges &&
                !hideUnpublishedDot ? (
                  <UnpublishedDot />
                ) : null}
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
                  key={`${item.label}`}
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
