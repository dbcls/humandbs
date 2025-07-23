import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_main/$lang/_layout/data-submission/navigation/before-application"
)({
  loader: ({ context }) => ({
    crumb: context.messages["Data-submission"]["before-submission"],
  }),
});
