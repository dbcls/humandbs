import { TrashButton } from "@/components/TrashButton";
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
}: {
  id: string;
  translations: AdminListItemTranslation[];
  onClickDelete: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-foreground-light group-data-[active=true]:text-white/80 mb-1 truncate text-xs">
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
      <TrashButton onClick={onClickDelete} />
    </>
  );
}
