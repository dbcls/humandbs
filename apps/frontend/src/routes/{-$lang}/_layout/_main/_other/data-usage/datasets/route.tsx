import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets"
)({
  loader: async ({ context }) => {
    return {
      crumbs: context.messages.Navbar["dataset-list"],
    };
  },
});
