import { CardWithCaption } from "@/components/Card";
import { ContentHeader } from "@/components/ContentHeader";
import { Link } from "@/components/Link";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { FA_ICONS } from "@/lib/faIcons";
import {
  Dataset,
  Person,
  Publication,
  ResearchDetail,
} from "@humandbs/backend/types";
import { createColumnHelper } from "@tanstack/react-table";
import ArrowIcon from "@/assets/icons/arrow.svg?react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Fragment } from "react/jsx-runtime";

export function VersionCard({ versionData }: { versionData: ResearchDetail }) {
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

function DatasetCard({ dataset }: { dataset: Dataset }) {
  return (
    <CardWithCaption
      caption={
        <DatasetCaption
          datasetId={dataset.datasetId}
          criteria={dataset.criteria}
          typeOfData={dataset.typeOfData}
        />
      }
      className="border-foreground-light border"
      containerClassName="p-5"
    >
      <Accordion type="multiple">
        {dataset.experiments.map((ex, i) => (
          <AccordionItem
            key={i}
            className="border-b-foreground-light border-dashed py-2"
            value={`item-${dataset.datasetId}-${i}`}
          >
            <AccordionTrigger className="flex items-center">
              <h3 className="text-secondary text-sm font-bold">{ex.header}</h3>
            </AccordionTrigger>
            <AccordionContent className="pt-5">
              <div className="grid grid-cols-[20rem_1fr] gap-y-4">
                {Object.entries(ex.data).map(([key, val]) => (
                  <Fragment key={key}>
                    <p className="text-secondary text-sm">{key}</p>
                    <p>{val}</p>
                  </Fragment>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </CardWithCaption>
  );
}

type DatasetCaptionProps = Pick<
  Dataset,
  "datasetId" | "criteria" | "typeOfData"
>;

function DatasetCaption({
  datasetId,
  criteria,
  typeOfData,
}: DatasetCaptionProps) {
  return (
    <div className="flex justify-between px-3">
      <div className="flex items-center gap-5">
        <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
        <span className="text-xs">{criteria}</span>
        <span className="text-xs">{typeOfData}</span>
      </div>

      <Link
        to={"/{-$lang}/data-usage"}
        variant={"button"}
        className="flex items-center gap-2"
      >
        <span>Details</span>
        <ArrowIcon className="block" />
      </Link>
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
