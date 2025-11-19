import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard, ListOfKeyValues } from "@/components/KeyValueCard";
import { Separator } from "@/components/Separator";
import { getDatasetQueryOptions } from "@/serverFunctions/datasets";
import { createFileRoute } from "@tanstack/react-router";
import { DatasetVersionCard } from "./-DatasetVersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId/"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    const dataset = await context.queryClient.ensureQueryData(
      getDatasetQueryOptions({
        lang: context.lang,
        datasetId: params.datasetId,
      })
    );

    return { data: dataset };
  },
  errorComponent: (ctx) => (
    <div className="text-danger">{ctx.error.message}</div>
  ),
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <DatasetVersionCard versionData={data} />;
}
