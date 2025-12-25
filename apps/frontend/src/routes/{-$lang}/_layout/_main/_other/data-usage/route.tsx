import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage"
)({
  loader: ({ context }) => ({ crumb: context.messages.Navbar["data-usage"] }),
});
