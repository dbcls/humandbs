import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_main/$lang")({
  context() {
    return {
      crumb: "Home",
    };
  },
});
