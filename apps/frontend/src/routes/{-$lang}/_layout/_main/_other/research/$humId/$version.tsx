import { createFileRoute, isNotFound, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/NotFound";
import { getResearchQueryOptions } from "@/serverFunctions/researches";

import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/research/$humId/$version")({
  loader: async ({ params, context }) => {
    try {
      const researchInfo = await context.queryClient.ensureQueryData(
        getResearchQueryOptions({
          humId: params.humId,
          version: params.version,
          lang: context.lang,
        }),
      );
      return { crumb: params.version, data: researchInfo.data };
    } catch (error) {
      // `$getResearch` throws `notFound()` for a missing research/version;
      // react-query re-surfaces it here, so re-throw the router notFound signal.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },

  notFoundComponent: () => <NotFound />,
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}
