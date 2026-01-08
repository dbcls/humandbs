import { createFileRoute } from "@tanstack/react-router";

import { getResearchQueryOptions } from "@/serverFunctions/researches";

import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/"
)({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(
      getResearchQueryOptions({
        lang: context.lang,
        humId: params.humId,
      })
    );

    return { data };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}
