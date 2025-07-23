import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/guidelines")({
  loader: ({ context }) => ({ crumb: context.messages.Navbar.guidelines }),
});
