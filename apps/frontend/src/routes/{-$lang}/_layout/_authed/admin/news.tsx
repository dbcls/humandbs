import { createFileRoute } from "@tanstack/react-router";
import { useFilters } from "@/hooks/useFilters";
import { newsAdminSearchParamsSchema } from "@/utils/queryParams";

import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  validateSearch: newsAdminSearchParamsSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { selectedId } = Route.useSearch();
  const { setFilters } = useFilters(Route.id);

  function handleSelectNewsItem(id: string | undefined) {
    setFilters({ selectedId: id });
  }

  return (
    <>
      <NewsItemsList
        selectedNewsItemId={selectedId}
        onSelectNewsItem={handleSelectNewsItem}
      />

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
