import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$lang/_layout/guidelines")({
  loader: () => ({
    crumb: "guidelines",
  }),
});
