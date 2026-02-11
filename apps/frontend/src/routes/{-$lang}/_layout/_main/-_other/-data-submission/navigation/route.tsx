import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation"
)({
  loader({ context }) {
    return {
      crumb: context.messages.Navbar.navigation,
    };
  },
});
