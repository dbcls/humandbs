import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-usage/researches"
)({
  loader: () => ({
    crumb: "Research list route",
  }),
});
