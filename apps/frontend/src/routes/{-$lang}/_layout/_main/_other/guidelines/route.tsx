import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/guidelines"
)({
  loader: ({ context }) => ({ crumb: context.messages?.Navbar?.guidelines }),
});
