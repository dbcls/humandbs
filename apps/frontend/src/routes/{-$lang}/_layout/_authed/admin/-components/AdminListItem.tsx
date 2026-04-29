import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LucideMoreVertical, Trash2 } from "lucide-react";
import { UnpublishedDot } from "./UnpublishedDot";

interface AdminListItemTranslation {
  lang: string;
  statuses: {
    published?: string;
    draft?: string;
  };
}

export function AdminListItem({
  id,
  translations,
  onClickDelete,
  onClickRename,
  hideDelete,
  hideRename,
}: {
  id: string;
  translations: AdminListItemTranslation[];
  onClickDelete: () => void;
  onClickRename?: () => void;
  hideDelete?: boolean;
  hideRename?: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-foreground-light mb-1 text-xs group-data-[active=true]:text-white/80">
          {id}
        </div>
        <ul className="space-y-0.5">
          {translations.map((translation) => {
            const publishedTitle = translation.statuses.published;
            const draftTitle = translation.statuses.draft;
            const displayTitle = publishedTitle || draftTitle;
            const hasChangedDraft =
              !!draftTitle && draftTitle !== publishedTitle;

            if (!displayTitle) return null;

            return (
              <li
                key={translation.lang}
                className="flex min-w-0 items-center gap-2 text-xs"
              >
                <span className="truncate text-sm">{displayTitle}</span>
                {hasChangedDraft ? <UnpublishedDot /> : null}
              </li>
            );
          })}
        </ul>
      </div>
      {!!hideDelete && !!hideRename ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={"ghost"} size={"icon"}>
              <LucideMoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {!hideRename && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickRename?.();
                  }}
                >
                  Change id...
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
            {!hideRename && !hideDelete && <DropdownMenuSeparator />}
            {!hideDelete && (
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickDelete();
                  }}
                >
                  Delete <Trash2 />
                </DropdownMenuItem>
              </DropdownMenuGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
