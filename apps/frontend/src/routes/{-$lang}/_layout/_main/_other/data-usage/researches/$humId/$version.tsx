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
  const params = Route.useParams();

  const context = Route.useRouteContext();

  const { data: versionData } = useQuery(
    getResearchQueryOptions({
      humId: params.humId,
      version: params.version,
      lang: context.lang,
    })
  );

  return (
    <CardWithCaption
      size={"lg"}
      variant={"dark"}
      caption={
        <div className="flex items-end gap-4">
          <div>
            <span className="text-xs">NDBC Research ID:</span>

            <h2 className="text-2xl leading-8">
              {FA_ICONS.books}
              <span className="ml-1">{versionData?.humVersionId}</span>
            </h2>
          </div>
          <Badge> リリース情報 </Badge>
        </div>
      }
    >
      <article className="mb-4">
        <ContentHeader>研究概要</ContentHeader>
        <div className="columns-2 [&>p]:mb-2 [&>p>span]:font-bold">
          <p>
            <span>目的:</span>
            {versionData?.summary.aims}
          </p>
          <p>
            <span>方法:</span>
            {versionData?.summary.methods}
          </p>
          <p>
            <span>対象:</span>
            {versionData?.summary.targets}
          </p>
        </div>
      </article>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <ContentHeader>データセット</ContentHeader>

        <ul>
          {versionData?.datasets.map((dataset) => (
            <li key={dataset.datasetId} className="mb-2">
              <DatasetCard dataset={dataset} />
            </li>
          ))}
        </ul>
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <ContentHeader>提供者情報</ContentHeader>

        <ul>
          {versionData?.dataProvider.map((p) => {
            return (
              <dl key={p.name} className="columns-2">
                <KeyValueCard title="代表者" value={p.name} />

                <KeyValueCard title="所属機関" value={p.organization?.name} />

                <KeyValueCard
                  title="プロジェクト/研究グループ名"
                  value={p.researchTitle}
                />

                <KeyValueCard title="ORCID" value={p.orcid} />
                <KeyValueCard
                  title="Dataset IDs"
                  value={p.datasetIds?.join(", ")}
                />
                <KeyValueCard title="ORCID" value={p.organization?.url} />
              </dl>
            );
          })}
        </ul>
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />

      <section>
        <ContentHeader>関連論文</ContentHeader>
        <Table
          columns={publicationColumns}
          data={versionData?.relatedPublication || []}
          className="mt-4"
        />
      </section>
      <hr className="border-foreground-light -mx-4 my-4 border-dashed" />
      <section>
        <ContentHeader>制限公開データの利用者一覧</ContentHeader>
        <Table
          columns={dataUsedByColumns}
          data={versionData?.controlledAccessUser || []}
        ></Table>
      </section>
    </CardWithCaption>
  );
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
