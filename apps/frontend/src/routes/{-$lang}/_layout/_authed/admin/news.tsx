import { createFileRoute } from "@tanstack/react-router";

import { useState } from "react";

import { useFilters } from "@/hooks/useFilters";
import { newsAdminSearchParamsSchema } from "@/utils/query-params";

import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  validateSearch: newsAdminSearchParamsSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { selectedId: urlSelectedId } = Route.useSearch();
  const { setFilters } = useFilters(Route.id);

  // selectedId leads the URL: set synchronously on click for instant highlight
  // and skeleton, then the URL catches up asynchronously via setFilters.
  // When the URL changes externally (browser back/forward), sync back to it.
  const [selectedId, setSelectedId] = useState<string | undefined>(urlSelectedId);
  if (selectedId !== urlSelectedId && urlSelectedId !== undefined) {
    setSelectedId(urlSelectedId);
  }

  function handleSelectNewsItem(id: string | undefined) {
    setSelectedId(id);
    setFilters({ selectedId: id });
  }

  return (
    <>
      <NewsItemsList selectedNewsItemId={selectedId} onSelectNewsItem={handleSelectNewsItem} />

      {selectedId ? (
        <NewsItemContent
          key={selectedId}
          selectedNewsItemId={selectedId}
          onSelectNewsItemId={handleSelectNewsItem}
        />
      ) : null}
    </>
  );
}
