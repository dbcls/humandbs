import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/before-application"
)({
  loader: ({ context }) => ({
    crumb: context.messages["Data-submission"]["before-application"],
  }),
});
