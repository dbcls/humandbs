import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LucideBell, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { DateRangePicker } from "@/components/DatePicker";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { Link } from "@/components/Link";
import { TagPill } from "@/components/TagPill";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/useFilters";
import {
  getPublishedNewsTitlesInfiniteQueryOptions,
  getPublicTagsQueryOptions,
} from "@/serverFunctions/news";
import type { DateStringRange } from "@/utils/dates";
import { newsPublicSearchParamsSchema } from "@/utils/queryParams";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news/")({
  validateSearch: newsPublicSearchParamsSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const locale = useLocale() as "en" | "ja";
  const t = useTranslations("Navbar");
  const search = Route.useSearch();
  const { setFilters } = useFilters(Route.id);

  const filters = {
    titleOrContent: search.q,
    publishedFrom: search.publishedFrom,
    publishedTo: search.publishedTo,
    tagIds: search.tagIds,
  };

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isPending } =
    useInfiniteQuery(getPublishedNewsTitlesInfiniteQueryOptions({ locale, filters }));

  const newsItems = data?.pages.flat() ?? [];

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const hasActiveFilters = !!(
    search.q ||
    search.publishedFrom ||
    search.publishedTo ||
    (search.tagIds && search.tagIds.length > 0)
  );

  function handleClearAll() {
    setFilters({ q: undefined, publishedFrom: undefined, publishedTo: undefined, tagIds: undefined });
  }

  return (
    <Card caption={t("all-news")} className="w-full">
      <div className="mb-4 flex flex-col gap-2">
        <FilterSearchInput
          value={search.q}
          onChange={(q) => setFilters({ q })}
          placeholder="Search by title or content…"
        />
        <DateRangePicker
          value={
            search.publishedFrom || search.publishedTo
              ? { from: search.publishedFrom, to: search.publishedTo }
              : undefined
          }
          onSelect={(range) =>
            setFilters({ publishedFrom: range.from, publishedTo: range.to })
          }
          onClear={() => setFilters({ publishedFrom: undefined, publishedTo: undefined })}
        />
        <TagFilter
          value={search.tagIds ?? []}
          onChange={(tagIds) =>
            setFilters({ tagIds: tagIds.length > 0 ? tagIds : undefined })
          }
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="slim"
            className="self-start text-xs text-muted-foreground"
            onClick={handleClearAll}
          >
            <XIcon className="mr-1 size-3" />
            Clear filters
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
          <Skeleton className="h-6" />
        </div>
      ) : (
        <ul
          className="space-y-1"
          style={{ opacity: isFetching && !isFetchingNextPage ? 0.6 : 1, transition: "opacity 0.15s" }}
        >
          {newsItems.map((item) => (
            <li key={item.id}>
              <span className="text-sm">{item.publishedAt}</span>
              {item.alert && (
                <LucideBell className="text-accent mx-1 inline size-4 align-baseline" />
              )}
              <Link
                className="ml-2"
                to={"/{-$lang}/news/$newsItemId"}
                params={{ lang: item.locale, newsItemId: item.id }}
              >
                {item.title}
              </Link>
            </li>
          ))}
          {!isPending && newsItems.length === 0 && (
            <li className="text-muted-foreground py-4 text-center text-sm">
              No news items found
            </li>
          )}
          <div ref={sentinelRef} className="h-4">
            {isFetchingNextPage && (
              <span className="text-muted-foreground block py-2 text-center text-xs">
                Loading more…
              </span>
            )}
          </div>
        </ul>
      )}
    </Card>
  );
}

function TagFilter({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const { data: allTags = [] } = useQuery(getPublicTagsQueryOptions());
  const anchor = useComboboxAnchor();

  return (
    <Combobox multiple value={value} onValueChange={onChange}>
      <ComboboxChips ref={anchor} className="min-h-8 text-sm">
        {value.map((id) => {
          const tag = allTags.find((t) => t.id === id);
          if (!tag) return null;
          return (
            <ComboboxChip key={id} color={tag.color}>
              {tag.name}
            </ComboboxChip>
          );
        })}
        <ComboboxChipsInput placeholder={value.length === 0 ? "Filter by tag…" : ""} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {allTags.length === 0 ? (
            <div className="py-2 text-center text-sm text-muted-foreground">
              No tags found
            </div>
          ) : (
            allTags.map((tag) => (
              <ComboboxItem key={tag.id} value={tag.id}>
                <TagPill color={tag.color}>{tag.name}</TagPill>
              </ComboboxItem>
            ))
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
