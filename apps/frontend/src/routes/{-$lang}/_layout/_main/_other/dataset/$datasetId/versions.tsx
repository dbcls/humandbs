import { createFileRoute } from "@tanstack/react-router";

import type { DatasetVersionItem } from "@humandbs/backend/types";

import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { getDatasetVersionsQueryOptions } from "@/serverFunctions/datasets";
import { extractStringFromPossiblyMultilingualValue } from "@/utils/i18n";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/dataset/$datasetId/versions")({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    const { data } = await context.queryClient.ensureQueryData(
      getDatasetVersionsQueryOptions({
        datasetId: params.datasetId,
        lang: context.lang,
        includeRawHtml: false,
      }),
    );
    return { data, crumb: "Versions" };
  },
});

function RouteComponent() {
  const { datasetId } = Route.useParams();
  const { data } = Route.useLoaderData();

  return (
    <CardWithCaption
      size={"lg"}
      variant={"light"}
      caption={
        <CardCaption icon="dataset" title="NBDC Dataset ID:">
          {datasetId}
        </CardCaption>
      }
    >
      <ul>
        {data.map((ver, i) => (
          <li key={i}>
            <DatasetVersionInfo version={ver} />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function DatasetVersionInfo({ version }: { version: DatasetVersionItem }) {
  return (
    <section>
      <div className="flex justify-between gap-2">
        <h3 className="inline">
          <Route.Link
            className="font-semibold text-secondary"
            to="../$version"
            params={{ version: version.version }}
          >
            {version.version}
          </Route.Link>
          <span className="ml-3 text-2xs text-foreground-light">{version.releaseDate}</span>
        </h3>
        <span>{version.criteria}</span>
      </div>

      <p>{extractStringFromPossiblyMultilingualValue(version.typeOfData)}</p>
    </section>
  );
}
