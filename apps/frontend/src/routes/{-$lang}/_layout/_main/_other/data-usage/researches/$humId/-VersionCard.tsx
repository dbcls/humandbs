import {
  type DatasetDoc,
  type ResearchDetailResponse,
} from "@humandbs/backend/types";
import { Link, useRouteContext } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";

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

const versionCardLabels = {
  ja: {
    releaseInfo: "リリース情報",
    researchOverview: "研究概要",
    aims: "目的:",
    methods: "方法:",
    targets: "対象:",
    datasets: "データセット",
    dataProvider: "提供者情報",
    representative: "代表者",
    organization: "所属機関",
    researchTitle: "プロジェクト/研究グループ名",
    relatedPublication: "関連論文",
    publicationTitle: "タイトル",
    publicationDatasets: "データセット",
    controlledAccessUser: "制限公開データの利用者一覧",
  },
  en: {
    releaseInfo: "Release info",
    researchOverview: "Research overview",
    aims: "Aims:",
    methods: "Methods:",
    targets: "Targets:",
    datasets: "Datasets",
    dataProvider: "Data provider",
    representative: "Representative",
    organization: "Organization",
    researchTitle: "Project / research group name",
    relatedPublication: "Related publications",
    publicationTitle: "Title",
    publicationDatasets: "Datasets",
    controlledAccessUser: "Controlled access users",
  },
} as const;

export function VersionCard({
  versionData,
  lang: langOverride,
}: {
  versionData: ResearchDetailResponse["data"];
  lang?: "ja" | "en";
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const labels = versionCardLabels[lang] ?? versionCardLabels[i18n.defaultLocale];

  return (
    <CardWithCaption
      size={"lg"}
      variant={"dark"}
      caption={
        <CardCaption
          title="NBDC Research ID:"
          icon="books"
          badge={
            <Link
              to="/{-$lang}/data-usage/researches/$humId/versions"
              params={{ humId: versionData.humId }}
            >
              {labels.releaseInfo}
            </Link>
          }
        >
          {versionData.humVersionId}
        </CardCaption>
      }
    >
      <article>
        <ContentHeader>{labels.researchOverview}</ContentHeader>
        <div className="columns-2 [&>p]:mb-2 [&>p>span]:font-bold">
          <p>
            <span>{labels.aims}</span>
            {versionData.summary.aims[lang]?.text}
          </p>
          <p>
            <span>{labels.methods}</span>
            {versionData.summary.methods[lang]?.text}
          </p>
          <p>
            <span>{labels.targets}</span>
            {versionData.summary.targets[lang]?.text}
          </p>
        </div>
      </article>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{labels.datasets}</ContentHeader>
        {versionData?.datasets.length === 0 && (
          <div className="bg-foreground-light/10 rounded-sm p-3"> No data</div>
        )}
        <ul>
          {versionData?.datasets.map((dataset) => (
            <li key={dataset.datasetId} className="mb-2">
              <DatasetInfo dataset={dataset} lang={lang} />
            </li>
          ))}
        </ul>
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{labels.dataProvider}</ContentHeader>
        <ul>
          {versionData?.dataProvider.map((p, i) => {
            return (
              <dl key={i} className="columns-2">
                <KeyValueCard title={labels.representative} value={p.name[lang]?.text ?? ""} />
                <KeyValueCard
                  title={labels.organization}
                  value={p.organization?.name[lang]?.text ?? ""}
                />
                <KeyValueCard
                  title={labels.researchTitle}
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
        <ContentHeader>{labels.relatedPublication}</ContentHeader>
        <Table
          columns={makePublicationColumns(labels)}
          data={versionData?.relatedPublication || []}
          className="mt-4"
          meta={{ lang }}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{labels.controlledAccessUser}</ContentHeader>
        <Table
          columns={dataUsedByColumns}
          data={versionData?.controlledAccessUser || []}
          meta={{ lang }}
        />
      </section>
    </CardWithCaption>
  );
}

function DatasetInfo({ dataset, lang }: { dataset: DatasetDoc; lang: "ja" | "en" | undefined }) {
  return (
    <CardWithCaption
      caption={
        <DatasetCaption
          datasetId={dataset.datasetId}
          criteria={dataset.criteria}
          typeOfData={dataset.typeOfData}
          lang={lang}
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
> & { lang: "ja" | "en" | undefined };

function DatasetCaption({
  datasetId,
  criteria,
  typeOfData,
  lang,
}: DatasetCaptionProps) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const resolvedLang = lang ?? routeLang;
  return (
    <div className="flex justify-between px-3">
      <div className="flex items-center gap-5">
        <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
        <span className="text-xs">{criteria}</span>
        <span className="text-xs">{typeOfData[resolvedLang ?? i18n.defaultLocale]}</span>
      </div>

      <Link
        to={"/{-$lang}/data-usage/datasets/$datasetId"}
        params={{ datasetId }}
        className="link-button"
      >
        <span>Details</span>
        <ArrowIcon className="block" />
      </Link>
    </div>
  );
}

const publicationsColumnHelper =
  createColumnHelper<
    ResearchDetailResponse["data"]["relatedPublication"][number]
  >();

function makePublicationColumns(labels: typeof versionCardLabels["ja"]) {
  return [
    publicationsColumnHelper.accessor("title", {
      id: "title",
      header: labels.publicationTitle,
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
      header: labels.publicationDatasets,
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
}

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
