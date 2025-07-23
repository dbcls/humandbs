import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/data-submission")({
  loader: ({ context }) => ({
    crumb: context.messages.Navbar["data-submission"],
  }),
});
