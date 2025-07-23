import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/news")({
  loader({ context }) {
    return {
      crumb: context.messages.Navbar["all-news"],
    };
  },
});
