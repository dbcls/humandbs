import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-submission/navigation/before-application/",
)({
  loader: ({ context }) => {
    throw redirect({
      to: "/{-$lang}/data-submission/navigation",
      params: { lang: context.lang },
    });
  },
});
