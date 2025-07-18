import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang/_layout/guidelines")({
  context: () => ({ crumb: "guidelines" }),
});
