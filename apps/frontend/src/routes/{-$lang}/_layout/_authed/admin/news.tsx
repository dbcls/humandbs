import { createFileRoute } from "@tanstack/react-router";

import { newsAdminSearchParamsSchema } from "@/utils/query-params";

import { NewsItemContent } from "./-components/NewsItemContent";
import { NewsItemsList } from "./-components/NewsItemsList";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/news")({
  validateSearch: newsAdminSearchParamsSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { selectedId } = Route.useSearch();

  const navigate = Route.useNavigate();

  const setSelectedId = (id: string | undefined) => {
    navigate({ search: (prev) => ({ ...prev, selectedId: id }) });
  };

  return (
    <>
      <NewsItemsList selectedNewsItemId={selectedId} onSelectNewsItemId={setSelectedId} />

      {selectedId ? (
        <NewsItemContent
          key={selectedId}
          selectedNewsItemId={selectedId}
          onSelectNewsItemId={setSelectedId}
        />
      ) : null}
    </>
  );
}
