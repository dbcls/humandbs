import {
  type DatasetDoc,
  type ResearchDetailResponse,
} from "@humandbs/backend/types";
import { Link, useRouteContext } from "@tanstack/react-router";
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

type VersionCardLabels = {
  releaseInfo: string;
  researchOverview: string;
  aims: string;
  methods: string;
  targets: string;
  datasets: string;
  dataProvider: string;
  representative: string;
  organization: string;
  researchTitle: string;
  relatedPublication: string;
  publicationTitle: string;
  publicationDatasets: string;
  controlledAccessUser: string;
  datasetId: string;
  criteria: string;
  typeOfData: string;
  details: string;
};

export function VersionCard({
  versionData,
  lang: langOverride,
}: {
  versionData: ResearchDetailResponse["data"];
  lang?: "ja" | "en";
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const tableT = useTranslations();
  const t = useTranslations("VersionCard");
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const labels = {
    releaseInfo: t("releaseInfo"),
    researchOverview: t("researchOverview"),
    aims: t("aims"),
    methods: t("methods"),
    targets: t("targets"),
    datasets: t("datasets"),
    dataProvider: t("dataProvider"),
    representative: t("representative"),
    organization: t("organization"),
    researchTitle: t("researchTitle"),
    relatedPublication: t("relatedPublication"),
    publicationTitle: t("publicationTitle"),
    publicationDatasets: t("publicationDatasets"),
    controlledAccessUser: t("controlledAccessUser"),
    datasetId: t("datasetId"),
    criteria: t("criteria"),
    typeOfData: t("typeOfData"),
    details: t("details"),
  };
  const tableMeta = {
    lang,
    t: tableT,
  };

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
        {versionData?.datasets.length > 0 && (
          <Table
            columns={makeDatasetColumns(labels)}
            data={versionData.datasets}
            className="mt-4"
            meta={tableMeta}
            variant="darker"
          />
        )}
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{labels.dataProvider}</ContentHeader>
        <ul>
          {versionData?.dataProvider.map((p, i) => {
            return (
              <dl key={i} className="columns-2">
                <KeyValueCard
                  title={labels.representative}
                  value={p.name[lang]?.text ?? ""}
                />
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
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{labels.controlledAccessUser}</ContentHeader>
        <Table
          columns={dataUsedByColumns}
          data={versionData?.controlledAccessUser || []}
          meta={tableMeta}
        />
      </section>
    </CardWithCaption>
  );
}

function DatasetInfo({
  dataset,
  lang,
}: {
  dataset: DatasetDoc;
  lang: "ja" | "en" | undefined;
}) {
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
    <div className="flex justify-between px-3 py-2 from bg-linear-to-r rounded-md text-white from-secondary to-secondary-light">
      <div className="flex items-center gap-5">
        <TextWithIcon icon={FA_ICONS.dataset}> {datasetId} </TextWithIcon>
        <span className="text-xs">{criteria}</span>
        <span className="text-xs">
          {typeOfData[resolvedLang ?? i18n.defaultLocale]}
        </span>
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

const datasetColumnHelper =
  createColumnHelper<ResearchDetailResponse["data"]["datasets"][number]>();

function makeDatasetColumns(labels: VersionCardLabels) {
  return [
    datasetColumnHelper.accessor("datasetId", {
      id: "datasetId",
      header: labels.datasetId,
      cell: (ctx) => (
        <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
          {ctx.getValue()}
        </TextWithIcon>
      ),
      maxSize: 12,
    }),
    datasetColumnHelper.accessor("criteria", {
      id: "criteria",
      header: labels.criteria,
      cell: (ctx) => <span className="text-sm">{ctx.getValue()}</span>,
      maxSize: 10,
    }),
    datasetColumnHelper.accessor("typeOfData", {
      id: "typeOfData",
      header: labels.typeOfData,
      cell: (ctx) => (
        <span className="text-sm">
          {ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]}
        </span>
      ),
      maxSize: 14,
    }),
    datasetColumnHelper.display({
      id: "details",
      header: "",
      cell: (ctx) => (
        <div className="flex justify-end">
          <Link
            to={"/{-$lang}/data-usage/datasets/$datasetId"}
            params={{ datasetId: ctx.row.original.datasetId }}
            className="link-button"
          >
            <span>{labels.details}</span>
            <ArrowIcon className="block" />
          </Link>
        </div>
      ),
      maxSize: 10,
    }),
  ];
}

const publicationsColumnHelper =
  createColumnHelper<
    ResearchDetailResponse["data"]["relatedPublication"][number]
  >();

function makePublicationColumns(labels: VersionCardLabels) {
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
      cell: (info) => (
        <span className="break-all text-sm">{info.getValue()}</span>
      ),
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
