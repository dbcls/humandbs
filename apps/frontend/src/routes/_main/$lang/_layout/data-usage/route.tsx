import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/data-usage")({
  loader: ({ context }) => ({ crumb: context.messages.Navbar["data-usage"] }),
});
