import { createFileRoute, isNotFound, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/NotFound";
import { i18n } from "@/config/i18n";
import {
  getExternalDatasetIds,
  prefetchDatasetParentResearches,
} from "@/lib/datasetParentResearch";
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
      // Warm parent-research links before VersionCard mounts without delaying
      // the route. VersionCard observes and continues the same query cache.
      void prefetchDatasetParentResearches(
        context.queryClient,
        getExternalDatasetIds(researchInfo.data),
        context.lang,
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
  head: ({ loaderData, match }) => {
    const lang = match.context.lang;

    const seoTitle = `HumanDBs - ${loaderData?.data.humVersionId}: ${loaderData?.data.title[lang ?? i18n.defaultLocale] ?? match.context.messages?.common?.research} (${loaderData?.data.version ?? ""})`;

    return {
      meta: [
        {
          title: seoTitle,
        },
      ],
    };
  },
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}
