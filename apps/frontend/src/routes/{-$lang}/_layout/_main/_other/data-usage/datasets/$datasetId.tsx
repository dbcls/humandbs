import {
  getDatasetQueryOptions,
  getDatasetsPaginatedQueryOptions,
} from "@/serverFunctions/datasets";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId"
)({
  component: RouteComponent,
  loader: async ({ context, params }) => {
    context.queryClient.ensureQueryData(
      getDatasetQueryOptions({
        lang: context.lang,
        datasetId: params.datasetId,
      })
    );
  },
});

function RouteComponent() {
  return (
    <div>
      Hello "/-$lang/_layout/_main/_other/data-usage/datasets/$datasetId"!
    </div>
  );
}
