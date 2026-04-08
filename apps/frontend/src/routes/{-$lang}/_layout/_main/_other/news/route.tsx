import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";

import { newsPublicSearchParamsSchema } from "@/utils/queryParams";
import { NewsList } from "./-NewsList";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news")({
  validateSearch: newsPublicSearchParamsSchema,
  loader({ context }) {
    return {
      crumb: context.messages?.Navbar?.["all-news"],
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const params = useParams({ strict: false });
  const selectedNewsItemId = params.newsItemId;

  return (
    <div className="flex items-start gap-3">
      <NewsList selectedNewsItemId={selectedNewsItemId} />
      <Outlet />
    </div>
  );
}
