import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang")({
  loader: ({ context }) => {
    return {
      crumb: context.messages.Navbar.home,
    };
  },
});
