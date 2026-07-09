import { createFileRoute, isNotFound, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/NotFound";
import { i18n } from "@/config/i18n";
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
  head: ({ loaderData, match }) => {
    const lang = match.context.lang;

    const seoTitle = `HumanDBs - ${loaderData?.data.data.title[lang ?? i18n.defaultLocale] ?? match.context.messages?.common?.research}`;

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

  return <VersionCard versionData={data.data} />;
}
