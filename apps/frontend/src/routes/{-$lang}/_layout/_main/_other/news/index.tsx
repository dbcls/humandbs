import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { useEffect, useRef } from "react";

import { Card } from "@/components/Card";
import { DateRangePicker } from "@/components/DatePicker";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import { getPublishedNewsTitlesInfiniteQueryOptions } from "@/serverFunctions/news";
import { newsPublicSearchParamsSchema } from "@/utils/query-params";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news/")({
  component: RouteComponent,
  validateSearch: newsPublicSearchParamsSchema,
});

function RouteComponent() {
  const { lang } = Route.useRouteContext();
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
    useInfiniteQuery(getPublishedNewsTitlesInfiniteQueryOptions({ locale: lang, filters }));

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
      className="flex w-full flex-1 flex-col"
      containerClassName="gap-2 flex flex-col"
    >
      <div className="mb-3 flex items-center gap-2">
        <FilterSearchInput
          value={search.q}
          className="max-w-xl flex-1"
          onChange={(q) => setFilters({ q })}
          placeholder="Search by title or content…"
        />
        <DateRangePicker
          value={
            search.publishedFrom || search.publishedTo
              ? { from: search.publishedFrom, to: search.publishedTo }
              : undefined
          }
          onSelect={(range) => setFilters({ publishedFrom: range.from, publishedTo: range.to })}
          onClear={() => setFilters({ publishedFrom: undefined, publishedTo: undefined })}
        />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="slim"
            className="text-muted-foreground text-xs"
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
          className={cn("max-h-[50ch] flex-1 overflow-y-auto", {
            "opacity-60 transition-opacity": isFetching && !isFetchingNextPage,
          })}
        >
          {newsItems.map((item) => {
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
            <li className="py-4 text-center text-muted-foreground text-sm">No news items found</li>
          )}
          <div ref={sentinelRef} className="h-4 shrink-0">
            {isFetchingNextPage && (
              <span className="block py-2 text-center text-muted-foreground text-xs">
                Loading more…
              </span>
            )}
          </div>
        </ul>
      )}
    </Card>
  );
}
