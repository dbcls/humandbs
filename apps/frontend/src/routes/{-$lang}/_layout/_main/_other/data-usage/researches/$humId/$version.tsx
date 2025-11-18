import { createFileRoute } from "@tanstack/react-router";
import { CardWithCaption } from "@/components/Card";
import { ContentHeader } from "@/components/ContentHeader";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";
import { getResearchQueryOptions } from "@/serverFunctions/researches";
import { Dataset, Person, Publication } from "@humandbs/backend/types";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { VersionCard } from "./-VersionCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId/$version"
)({
  loader: async ({ params, context }) => {
    const researchInfo = await context.queryClient.ensureQueryData(
      getResearchQueryOptions({
        humId: params.humId,
        version: params.version,
        lang: context.lang,
      })
    );
    return { crumb: params.version, data: researchInfo };
  },

  component: RouteComponent,
});

function RouteComponent() {
  const { data } = Route.useLoaderData();

  return <VersionCard versionData={data} />;
}

const publicationsColumnHelper = createColumnHelper<Publication>();

const publicationColumns = [
  publicationsColumnHelper.accessor("title", {
    id: "title",
    header: "タイトル",
    cell: (info) => <span className="text-sm">{info.getValue()}</span>,
  }),
  publicationsColumnHelper.accessor("doi", {
    id: "DOI",
    header: "DOI",
    cell: (info) => info.getValue(),
  }),
  publicationsColumnHelper.accessor("datasetIds", {
    id: "datasetIDs",
    header: "データセット",
    cell: (info) => (
      <ul>
        {info.getValue()?.map((datasetId) => (
          <li key={datasetId}>
            <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
              {datasetId}
            </TextWithIcon>
          </li>
        ))}
      </ul>
    ),
  }),
];

const dataUsedByColumnsHelper = createColumnHelper<Person>();

const dataUsedByColumns = [
  dataUsedByColumnsHelper.accessor("name", {
    id: "name",
    header: "Name",
    cell: (ctx) => ctx.getValue(),
  }),
  dataUsedByColumnsHelper.accessor("organization.name", {
    id: "org.name",
    header: "Organization name",
    cell: (ctx) => ctx.getValue(),
  }),
];

function DatasetCard({ dataset }: { dataset: Dataset }) {
  return (
    <CardWithCaption
      caption={
        <DatasetCaption
          datasetId={dataset.datasetId}
          // publicity={dataset.publicity}
        />
      }
      className="border-foreground-light border"
    >
      <ul>
        {/*{dataset.sequences.map((sequence, index) => (
          <li key={sequence.id}>
            <div className="flex justify-between text-sm">
              <div className="text-secondary font-bold">{sequence.id}</div>
              <div>
                {sequence.fileSize.value} {sequence.fileSize.unit}
              </div>
            </div>
            {sequence.description}
            {index < dataset.sequences.length - 1 && (
              <hr className="border-foreground-light -mx-2 my-2 border-dashed" />
            )}
          </li>
        ))}*/}

        {dataset.releaseDate}
      </ul>
    </CardWithCaption>
  );
}

type DatasetCaptionProps = Pick<Dataset, "datasetId" | "criteria">;

function DatasetCaption({ datasetId, criteria }: DatasetCaptionProps) {
  return (
    <div className="flex justify-between">
      <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
      <div>{criteria}</div>
    </div>
  );
}

function KeyValueCard({
  title,
  value,
}: {
  title: string;
  value: React.ReactNode | null | undefined;
}) {
  if (!value) return null;
  return (
    <>
      <dt className="text-secondary">{title}</dt>
      <dd>{value}</dd>
      <hr className="border-foreground-light my-2 border" />
    </>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white/20 px-2 py-1 text-xs text-white">
      {children}
    </span>
  );
}
