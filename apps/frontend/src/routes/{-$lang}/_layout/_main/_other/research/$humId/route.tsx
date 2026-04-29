import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/research/$humId",
)({
  // component: RouteComponent,
  loader: async ({ params }) => {
    // Fetch data using humId
    return { crumb: params.humId };
  },
});
