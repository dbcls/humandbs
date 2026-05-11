import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "use-intl";

import { Card } from "@/components/Card";
import { DateRangePicker } from "@/components/DatePicker";
import { FilterSearchInput } from "@/components/FilterSearchInput";
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
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/{-$lang}/_layout/_main/_other/news/");

export function NewsList({
  selectedNewsItemId,
}: {
  selectedNewsItemId?: string;
}) {
  const locale = useLocale() as "en" | "ja";
  const t = useTranslations("Navbar");
  const search = routeApi.useSearch();
  const { setFilters } = useFilters(routeApi.id);

  const filters = {
    titleOrContent: search.q,
    publishedFrom: search.publishedFrom,
    publishedTo: search.publishedTo,
    tagIds: search.tagIds,
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
  } = useInfiniteQuery(
    getPublishedNewsTitlesInfiniteQueryOptions({ locale, filters }),
  );

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
    setFilters({
      q: undefined,
      publishedFrom: undefined,
      publishedTo: undefined,
      tagIds: undefined,
    });
  }

  return (
    <Card
      caption={t("all-news")}
      className="h-auto w-full flex-1"
      containerClassName="main-content gap-2 flex flex-col gap-2"
    >
      <div className="mb-3 flex flex-col gap-2">
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
          onClear={() =>
            setFilters({ publishedFrom: undefined, publishedTo: undefined })
          }
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="slim"
            className="text-muted-foreground self-start text-xs"
            onClick={handleClearAll}
          >
            <XIcon className="mr-1 size-3" />
            Clear filters
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <ul
          className={cn("flex-1 overflow-y-auto", {
            "opacity-60 transition-opacity": isFetching && !isFetchingNextPage,
          })}
        >
          {newsItems.map((item) => {
            const isActive = item.id === selectedNewsItemId;
            return (
              <li key={item.id} className="flex flex-col gap-0.5 px-3 py-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-xs opacity-70">
                    {item.publishedAt ?? "No date"}
                  </span>
                </div>

                <Link
                  to="/{-$lang}/news/$newsItemId"
                  params={{ lang: item.locale, newsItemId: item.id }}
                  search={search}
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
          {newsItems.length === 0 && (
            <li className="text-muted-foreground py-4 text-center text-sm">
              No news items found
            </li>
          )}
          <div ref={sentinelRef} className="h-4 shrink-0">
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
