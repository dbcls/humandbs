import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import {
  getDatasetQueryOptions,
  getDatasetVersionsQueryOptions,
} from "@/serverFunctions/datasets";
import { DatasetVersionItem } from "@humandbs/backend/types";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/datasets/$datasetId/versions"
)({
  component: RouteComponent,
  loader: async ({ params, context }) => {
    const { data } = await context.queryClient.ensureQueryData(
      getDatasetVersionsQueryOptions({
        datasetId: params.datasetId,
        lang: context.lang,
      })
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
            <DatasetVersionInfo version={ver} datasetId={datasetId} />
          </li>
        ))}
      </ul>
    </CardWithCaption>
  );
}

function DatasetVersionInfo({
  datasetId,
  version,
}: {
  datasetId: string;
  version: DatasetVersionItem;
}) {
  return (
    <section>
      <h3 className="inline">
        <Route.Link
          className="text-secondary font-semibold"
          to="../$version"
          params={{ version: version.version }}
        >
          {datasetId}.{version.version}
        </Route.Link>
        <span className="text-foreground-light text-2xs ml-3">
          {version.releaseDate}
        </span>
      </h3>

      {version.criteria && <ListOfParagraphs paragraphs={version.criteria} />}
    </section>
  );
}

function ListOfParagraphs({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
