import { createFileRoute } from "@tanstack/react-router";

import { getResearchQueryOptions } from "@/serverFunctions/researches";

import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/$version"
)({
  loader: async ({ params, context }) => {
    const researchInfo = await context.queryClient.ensureQueryData(
      getResearchQueryOptions({
        humId: params.humId,
        version: params.version,
        lang: context.lang,
      })
    );
    return { crumb: params.version, data: researchInfo };
  },

  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}
