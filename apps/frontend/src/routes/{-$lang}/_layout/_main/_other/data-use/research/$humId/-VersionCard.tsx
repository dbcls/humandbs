import {
  type DatasetDoc,
  type ResearchDetailResponse,
} from "@humandbs/backend/types";
import { useRouteContext } from "@tanstack/react-router";
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
import { Link } from "@/components/Link";

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
              to="/{-$lang}/data-use/research/$humId/versions"
              className="no-underline text-white"
              params={{ humId: versionData.humId }}
            >
              {t("releaseInfo")}
            </Link>
          }
        >
          {versionData.humVersionId}
        </CardCaption>
      }
    >
      <article>
        <ContentHeader>{t("researchOverview")}</ContentHeader>
        <div className="columns-2 [&>p]:mb-2 [&>p>span]:font-bold">
          <p>
            <span>{t("aims")}</span>
            {versionData.summary.aims[lang]?.text}
          </p>
          <p>
            <span>{t("methods")}</span>
            {versionData.summary.methods[lang]?.text}
          </p>
          <p>
            <span>{t("targets")}</span>
            {versionData.summary.targets[lang]?.text}
          </p>
        </div>
      </article>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("datasets")}</ContentHeader>
        {versionData?.datasets.length === 0 && (
          <div className="bg-foreground-light/10 rounded-sm p-3"> No data</div>
        )}
        {versionData?.datasets.length > 0 && (
          <Table
            columns={makeDatasetColumns(t)}
            data={versionData.datasets}
            className="mt-4"
            meta={tableMeta}
            variant="darker"
          />
        )}
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("dataProvider")}</ContentHeader>
        <ul>
          {versionData?.dataProvider.map((p, i) => {
            return (
              <dl key={i} className="columns-2">
                <KeyValueCard
                  title={t("representative")}
                  value={p.name[lang]?.text ?? ""}
                />
                <KeyValueCard
                  title={t("organization")}
                  value={p.organization?.name[lang]?.text ?? ""}
                />
                <KeyValueCard
                  title={t("periodOfDataUse")}
                  value={`${p.periodOfDataUse?.startDate || ""} - ${p.periodOfDataUse?.endDate || ""}`}
                />
                <KeyValueCard
                  title={t("researchTitle")}
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
        <ContentHeader>{t("relatedPublication")}</ContentHeader>
        <Table
          columns={makePublicationColumns(t)}
          data={versionData?.relatedPublication || []}
          className="mt-4"
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("controlledAccessUser")}</ContentHeader>
        <Table
          columns={makeDataUsedByColumns(t)}
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
        to={"/{-$lang}/data-use/datasets/$datasetId"}
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

function makeDatasetColumns(
  t: ReturnType<typeof useTranslations<"VersionCard">>,
) {
  return [
    datasetColumnHelper.accessor("datasetId", {
      id: "datasetId",
      header: t("datasetId"),
      cell: (ctx) => (
        <Link
          to="/{-$lang}/data-use/datasets/$datasetId"
          params={{ datasetId: ctx.getValue() }}
        >
          <TextWithIcon icon={FA_ICONS.books}>{ctx.getValue()}</TextWithIcon>
        </Link>
      ),
      maxSize: 12,
    }),
    datasetColumnHelper.accessor("criteria", {
      id: "criteria",
      header: t("criteria"),
      cell: (ctx) => <span className="text-sm">{ctx.getValue()}</span>,
      maxSize: 10,
    }),
    datasetColumnHelper.accessor("typeOfData", {
      id: "typeOfData",
      header: t("typeOfData"),
      cell: (ctx) => (
        <span className="text-sm">
          {ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]}
        </span>
      ),
      maxSize: 14,
    }),
  ];
}

const publicationsColumnHelper =
  createColumnHelper<
    ResearchDetailResponse["data"]["relatedPublication"][number]
  >();

function makePublicationColumns(
  t: ReturnType<typeof useTranslations<"VersionCard">>,
) {
  return [
    publicationsColumnHelper.accessor("title", {
      id: "title",
      header: t("publicationTitle"),
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
      header: t("publicationDatasets"),
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

function makeDataUsedByColumns(
  t: ReturnType<typeof useTranslations<"VersionCard">>,
) {
  return [
    dataUsedByColumnsHelper.accessor("name", {
      id: "name",
      header: t("investigator"),
      cell: (ctx) =>
        ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale]
          ?.text,
    }),
    dataUsedByColumnsHelper.accessor("organization.name", {
      id: "org.name",
      header: t("organization"),
      cell: (ctx) =>
        ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]
          ?.text,
    }),
    dataUsedByColumnsHelper.accessor("periodOfDataUse", {
      id: "periodOfDataUse",
      header: t("periodOfDataUse"),
      cell: (ctx) => {
        const v = ctx.getValue();
        if (!v) return null;
        const format = (d: string) => d.replace(/-/g, "/");
        return `${format(v.startDate || "")} - ${format(v.endDate || "")}`;
      },
    }),
  ];
}
