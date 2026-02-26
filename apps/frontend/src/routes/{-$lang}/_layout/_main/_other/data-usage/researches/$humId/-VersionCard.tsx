import {
  type DatasetDoc,
  type ResearchDetailResponse,
} from "@humandbs/backend/types";
import { getRouteApi, useRouteContext } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { useTranslations } from "use-intl";

import ArrowIcon from "@/assets/icons/arrow.svg?react";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard, ListOfKeyValues } from "@/components/KeyValueCard";
import { Separator } from "@/components/Separator";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { i18n } from "@/config/i18n";
import { FA_ICONS } from "@/lib/faIcons";
import { extractStringFromPossiblyMultilingualValue } from "@/utils/i18n";

export function VersionCard({
  versionData,
}: {
  versionData: ResearchDetailResponse["data"];
}) {
  const Route = getRouteApi(
    "/{-$lang}/_layout/_main/_other/data-usage/researches/$humId",
  );

  const { lang } = Route.useRouteContext();
  const { t } = useTranslations("Research-detail");

  return (
    <CardWithCaption
      size={"lg"}
      variant={"dark"}
      caption={
        <CardCaption
          title="NBDC Research ID:"
          icon="books"
          badge={<Route.Link to="versions">リリース情報</Route.Link>}
        >
          {versionData.humVersionId}
        </CardCaption>
      }
    >
      <article>
        <ContentHeader>研究概要</ContentHeader>
        <div className="columns-2 [&>p]:mb-2 [&>p>span]:font-bold">
          <p>
            <span>目的:</span>
            {versionData.summary.aims[lang ?? i18n.defaultLocale]?.text}
          </p>
          <p>
            <span>方法:</span>
            {versionData.summary.methods[lang ?? i18n.defaultLocale]?.text}
          </p>
          <p>
            <span>対象:</span>
            {versionData.summary.targets[lang ?? i18n.defaultLocale]?.text}
          </p>
        </div>
      </article>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>データセット</ContentHeader>
        {versionData?.datasets.length === 0 && (
          <div className="bg-foreground-light/10 rounded-sm p-3"> No data</div>
        )}
        <ul>
          {versionData?.datasets.map((dataset) => (
            <li key={dataset.datasetId} className="mb-2">
              <DatasetInfo dataset={dataset} />
            </li>
          ))}
        </ul>
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>提供者情報</ContentHeader>

        <ul>
          {versionData?.dataProvider.map((p, i) => {
            return (
              <dl key={i} className="columns-2">
                <KeyValueCard title="代表者" value={p.name[lang]?.text ?? ""} />

                <KeyValueCard
                  title="所属機関"
                  value={p.organization?.name[lang]?.text ?? ""}
                />

                <KeyValueCard
                  title="プロジェクト/研究グループ名"
                  value={p.researchTitle?.[lang] ?? ""}
                />

                <KeyValueCard title="ORCID" value={p.orcid} />
                <KeyValueCard
                  title="Dataset IDs"
                  value={p.datasetIds?.join(", ")}
                />
              </dl>
            );
          })}
        </ul>
      </section>
      <Separator className="-mx-4" />

      <section>
        <ContentHeader>関連論文</ContentHeader>
        <Table
          columns={publicationColumns}
          data={versionData?.relatedPublication || []}
          className="mt-4"
          meta={{ lang, t }}
        />
      </section>
      <Separator className="-mx-4" />
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

function DatasetInfo({ dataset }: { dataset: DatasetDoc }) {
  const { lang } = useRouteContext({ from: "/{-$lang}/_layout" });

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
    >
      <Accordion type="multiple">
        {dataset.experiments.map((ex, i) => (
          <AccordionItem
            key={i}
            className="border-b-foreground-light border-dashed py-2"
            value={`item-${dataset.datasetId}-${i}`}
          >
            <AccordionTrigger className="flex items-center">
              <h3 className="text-secondary text-sm font-bold">
                {extractStringFromPossiblyMultilingualValue(
                  ex.data?.["Experimental Method"],
                  lang,
                )}
              </h3>
            </AccordionTrigger>
            <AccordionContent className="pt-5">
              <ListOfKeyValues keyValues={ex.data} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </CardWithCaption>
  );
}

type DatasetCaptionProps = Pick<
  DatasetDoc,
  "datasetId" | "criteria" | "typeOfData"
>;

function DatasetCaption({
  datasetId,
  criteria,
  typeOfData,
}: DatasetCaptionProps) {
  console.log("dataset caption props", { datasetId, criteria, typeOfData });
  const Route = getRouteApi("/{-$lang}/_layout/_main/_other/data-usage");
  const { lang } = Route.useRouteContext();
  return (
    <div className="flex justify-between px-3">
      <div className="flex items-center gap-5">
        <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
        <span className="text-xs">{criteria}</span>
        <span className="text-xs">{typeOfData[lang]}</span>
      </div>

      <Route.Link
        to={"/{-$lang}/data-usage/datasets/$datasetId"}
        params={{ datasetId }}
        className="link-button"
      >
        <span>Details</span>
        <ArrowIcon className="block" />
      </Route.Link>
    </div>
  );
}

const publicationsColumnHelper =
  createColumnHelper<
    ResearchDetailResponse["data"]["relatedPublication"][number]
  >();

const publicationColumns = [
  publicationsColumnHelper.accessor("title", {
    id: "title",
    header: "タイトル",
    cell: (ctx) => (
      <span className="text-sm">
        {ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]}
      </span>
    ),
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

const dataUsedByColumnsHelper =
  createColumnHelper<
    ResearchDetailResponse["data"]["controlledAccessUser"][number]
  >();

const dataUsedByColumns = [
  dataUsedByColumnsHelper.accessor("name", {
    id: "name",
    header: "Name",
    cell: (ctx) =>
      ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
  dataUsedByColumnsHelper.accessor("organization.name", {
    id: "org.name",
    header: "Organization name",
    cell: (ctx) =>
      ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
];
