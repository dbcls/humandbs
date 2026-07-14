import { createFileRoute, isNotFound, notFound } from "@tanstack/react-router";

import { NotFound } from "@/components/NotFound";
import { getDatasetQueryOptions } from "@/serverFunctions/datasets";

import { DatasetVersionCard } from "./-DatasetVersionCard";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/dataset/$datasetId/")({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    try {
      const dataset = await context.queryClient.ensureQueryData(
        getDatasetQueryOptions({
          lang: context.lang,
          datasetId: params.datasetId,
          includeRawHtml: false,
        }),
      );

      return { data: dataset.data };
    } catch (error) {
      // `$getDataset` throws `notFound()` for a missing dataset; react-query
      // re-surfaces it here, so re-throw it as the router notFound signal.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData, match }) => {
    const seoTitle = `HumanDBs - ${loaderData?.data.datasetId ?? match.context.messages?.common?.dataset}`;

    return {
      meta: [
        {
          title: seoTitle,
        },
      ],
    };
  },
  notFoundComponent: () => <NotFound />,
  errorComponent: (ctx) => <div className="text-danger">{ctx.error.message}</div>,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <DatasetVersionCard versionData={data} />;
}
