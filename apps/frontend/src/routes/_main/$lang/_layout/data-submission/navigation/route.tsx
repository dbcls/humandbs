import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/navigation"
)({
  loader({ context }) {
    return {
      crumb: context.messages.Navbar.navigation,
    };
  },
});
