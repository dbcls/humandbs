import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$researchId"
)({
  loader: ({ params }) => {
    return { crumb: params.researchId };
  },
});
