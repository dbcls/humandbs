import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/refresh")({
  server: {
    handlers: {
      POST: async () => {},
    },
  },
});
