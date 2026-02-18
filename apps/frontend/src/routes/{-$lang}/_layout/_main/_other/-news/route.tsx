import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/news")({
  loader({ context }) {
    return {
      crumb: context.messages.Navbar["all-news"],
    };
  },
});
