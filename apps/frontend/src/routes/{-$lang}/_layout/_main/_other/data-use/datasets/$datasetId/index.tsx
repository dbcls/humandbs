import { createFileRoute } from "@tanstack/react-router";

import { useAutoAddToCart } from "@/hooks/useCart";
import { getDatasetQueryOptions } from "@/serverFunctions/datasets";

import { DatasetVersionCard } from "./-DatasetVersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-use/datasets/$datasetId/",
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const dataset = await context.queryClient.ensureQueryData(
      getDatasetQueryOptions({
        lang: context.lang,
        datasetId: params.datasetId,
        includeRawHtml: false,
      }),
    );

    return { data: dataset.data };
  },
  errorComponent: (ctx) => (
    <div className="text-danger">{ctx.error.message}</div>
  ),
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  useAutoAddToCart(data);

  return <DatasetVersionCard versionData={data} />;
}
