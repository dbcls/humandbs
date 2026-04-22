import { newsPublicSearchParamsSchema } from "@/utils/queryParams";
import { createFileRoute } from "@tanstack/react-router";
import { NewsList } from "./-NewsList";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news/")({
  component: RouteComponent,
  validateSearch: newsPublicSearchParamsSchema,
});

function RouteComponent() {
  return <NewsList />;
}
