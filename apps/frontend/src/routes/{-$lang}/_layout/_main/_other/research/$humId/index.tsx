import { createFileRoute, isNotFound, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/NotFound";
import { getResearchQueryOptions } from "@/serverFunctions/researches";

import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/research/$humId/")({
  loader: async ({ context, params }) => {
    try {
      const data = await context.queryClient.ensureQueryData(
        getResearchQueryOptions({
          lang: context.lang,
          humId: params.humId,
        }),
      );

      return { data };
    } catch (error) {
      // `$getResearch` throws `notFound()` for a missing research; react-query
      // re-surfaces it here, so re-throw it as the router notFound signal.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },

  notFoundComponent: () => <NotFound />,
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data.data} />;
}
