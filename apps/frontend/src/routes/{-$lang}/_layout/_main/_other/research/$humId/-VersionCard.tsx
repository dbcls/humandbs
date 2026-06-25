import { ClientOnly, useRouteContext } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { useTranslations } from "use-intl";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { AccessCriteriaLabel } from "@/components/AccessCriteriaLabel";
import { AddToCartToggle } from "@/components/AddToCartToggle";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { DatasetLink } from "@/components/DatasetLink";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Link } from "@/components/Link";
import { Markdown } from "@/components/markdown";
import { ResearchDatasetCartRowButton } from "@/components/ResearchDatasetCartRowButton";
import { Separator } from "@/components/Separator";
import { SortHeader, Table } from "@/components/Table";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import { useCartTableHeader } from "@/hooks/useCart";
import { toDateString } from "@/utils/dates";

export function VersionCard({
  versionData,
  lang: langOverride,
}: {
  versionData: ResearchDetailResponse["data"];
  lang?: Locale;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const t = useTranslations();
  const tVersionCard = useTranslations("VersionCard");
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;

  const tableMeta = {
    lang,
    t,
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
              to="/{-$lang}/research/$humId/versions"
              className="text-white no-underline visited:text-white"
              params={{ humId: versionData.humId }}
            >
              {t("Research.release-info")}
            </Link>
          }
        >
          {versionData.humVersionId}
        </CardCaption>
      }
    >
      <article>
        <ContentHeader>{t("Research.researchOverview")}</ContentHeader>
        <div className="columns-2 [&>p>span]:mr-2 [&>p>span]:font-extrabold [&>p]:mb-4">
          <p>
            <span>{t("Research.aims")}:</span>
            {versionData.summary.aims[lang]?.text}
          </p>
          <p>
            <span>{t("Research.methods")}:</span>
            {versionData.summary.methods[lang]?.text}
          </p>
          <p>
            <span>{t("Research.targets")}:</span>
            {
              <Markdown
                className="inline-prose text-base"
                contentHtml={{ markup: versionData.summary.targets[lang]?.rawHtml ?? "" }}
              />
            }
          </p>
        </div>
      </article>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("Research.datasets")}</ContentHeader>
        {versionData?.datasets.length === 0 && (
          <div className="rounded-sm bg-foreground-light/10 p-3"> No data</div>
        )}
        {versionData?.datasets.length > 0 && (
          <Table
            columns={datasetColumns}
            data={versionData.datasets}
            className="mt-4 [&_td]:text-sm"
            meta={tableMeta}
            variant="darker"
          />
        )}
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("Research.dataProvider")}</ContentHeader>
        <ul>
          {versionData?.dataProvider.map((p) => {
            return (
              <dl key={`${p.name.ja?.text}-${p.name.en?.text}`} className="columns-2">
                <KeyValueCard title={t("Research.representative")} value={p.name[lang]?.text} />
                <KeyValueCard
                  title={t("Research.organization")}
                  value={p.organization?.name[lang]?.text}
                />

                <KeyValueCard title={t("Research.researchTitle")} value={p.researchTitle?.[lang]} />
                <KeyValueCard title="ORCID" value={p.orcid} />
                <KeyValueCard
                  title="Dataset IDs"
                  value={p.datasetIds?.map((id) => <DatasetLink key={id} datasetId={id} />)}
                />
              </dl>
            );
          })}
        </ul>
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("Research.researchProject.self")}</ContentHeader>
        <Table
          className="mt-4 text-sm"
          columns={researchProjectsColumns}
          data={versionData.researchProject}
          meta={tableMeta}
        />
      </section>
      <section>
        <ContentHeader>{t("Research.grant.self")}</ContentHeader>
        <Table
          className="mt-4 text-sm"
          columns={grantsColumns}
          data={versionData.grant}
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("Research.relatedPublication")}</ContentHeader>
        <Table
          columns={makePublicationColumns(tVersionCard)}
          data={versionData?.relatedPublication || []}
          className="mt-4 text-sm"
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("Research.controlledAccessUser")}</ContentHeader>
        <Table
          className="mt-4 text-sm"
          columns={dataUsedByColumns}
          data={versionData?.controlledAccessUser || []}
          meta={tableMeta}
        />
      </section>
    </CardWithCaption>
  );
}

const datasetColumnHelper =
  createColumnHelper<ResearchDetailResponse["data"]["datasets"][number]>();

const datasetColumns = [
  datasetColumnHelper.display({
    id: "cart",
    header: (ctx) => (
      <ClientOnly fallback={null}>
        <ResearchDatasetsCartHeaderButton tableDatasets={ctx.table.options.data} />
      </ClientOnly>
    ),
    cell: (ctx) => (
      <ClientOnly fallback={null}>
        <ResearchDatasetCartRowButton datasetId={ctx.row.original.datasetId} />
      </ClientOnly>
    ),

    size: 1,
    maxSize: 1,
  }),
  datasetColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("Research.datasetId")} />
    ),
    cell: (ctx) => <DatasetLink datasetId={ctx.getValue()} />,
    maxSize: 12,
  }),
  datasetColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("Research.criteria"),
    cell: (ctx) => <AccessCriteriaLabel criteria={ctx.getValue()} />, //<span className="text-sm">{ctx.getValue()}</span>,
    maxSize: 10,
  }),
  datasetColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => ctx.table.options.meta?.t("Research.typeOfData"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale],

    maxSize: 14,
  }),
  datasetColumnHelper.accessor("releaseDate", {
    id: "releaseDate",
    header: (ctx) => ctx.table.options.meta?.t("Dataset.releaseDate"),
    cell: (ctx) => toDateString(ctx.getValue()),
  }),
];

function ResearchDatasetsCartHeaderButton({
  tableDatasets,
}: {
  tableDatasets: ResearchDetailResponse["data"]["datasets"];
}) {
  const t = useTranslations("common");

  const { allInCart, someInCart, handleToggleDatasets } = useCartTableHeader({ tableDatasets });

  return (
    <AddToCartToggle
      variant={"header"}
      state={allInCart ? true : someInCart ? "indeterminate" : false}
      onClick={handleToggleDatasets}
      aria-label={allInCart ? t("already-in-cart") : t("add-all-to-cart")}
    />
  );
}

const publicationsColumnHelper =
  createColumnHelper<ResearchDetailResponse["data"]["relatedPublication"][number]>();

function makePublicationColumns(t: ReturnType<typeof useTranslations<"VersionCard">>) {
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
        <a href={info.getValue() ?? undefined} className="break-all text-sm">
          {info.renderValue()}
        </a>
      ),
    }),
    publicationsColumnHelper.accessor("datasetIds", {
      id: "datasetIDs",
      header: t("publicationDatasets"),
      cell: (info) => (
        <ul>
          {info.getValue()?.map((datasetId) => (
            <li key={datasetId}>
              <DatasetLink datasetId={datasetId} />
            </li>
          ))}
        </ul>
      ),
    }),
  ];
}

const dataUsedByColumnsHelper =
  createColumnHelper<ResearchDetailResponse["data"]["controlledAccessUser"][number]>();

const dataUsedByColumns = [
  dataUsedByColumnsHelper.accessor("name", {
    id: "cau.name",
    header: (ctx) => ctx.table.options.meta?.t("Person.name"),
    cell: (ctx) => ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
  dataUsedByColumnsHelper.accessor("organization.name", {
    id: "cau.org.name",
    header: (ctx) => ctx.table.options.meta?.t("Research.organization"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
  dataUsedByColumnsHelper.accessor("organization.address.country", {
    id: "cau.org.country",
    header: (ctx) => ctx.table.options.meta?.t("Research.organization-country"),
    cell: (ctx) => ctx.getValue(),
  }),
  dataUsedByColumnsHelper.accessor("researchTitle", {
    id: "cau.research-title",
    header: (ctx) => ctx.table.options.meta?.t("Research.researchTitle"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  dataUsedByColumnsHelper.accessor("datasetIds", {
    id: "cau.datasetIds",
    header: (ctx) => ctx.table.options.meta?.t("Research.datasets"),
    cell: (ctx) => (
      <ul>
        {ctx.getValue()?.map((id) => (
          <li key={id}>
            <DatasetLink datasetId={id} />
          </li>
        ))}
      </ul>
    ),
  }),
  dataUsedByColumnsHelper.accessor("periodOfDataUse", {
    id: "cau.periodOfDataUse",
    header: (ctx) => ctx.table.options.meta?.t("Research.periodOfDataUse"),
    cell: (ctx) => {
      const v = ctx.getValue();
      if (!v) return null;

      return `${v.startDate} — ${v.endDate || ""}`;
    },
  }),
];

const grantsColumnsHelper = createColumnHelper<ResearchDetailResponse["data"]["grant"][number]>();

const grantsColumns = [
  grantsColumnsHelper.accessor("agency.name", {
    id: "grantAgency",
    header: (ctx) => ctx.table.options.meta?.t("Research.grant.agency"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  grantsColumnsHelper.accessor("title", {
    id: "grantTitle",
    header: (ctx) => ctx.table.options.meta?.t("Research.grant.title"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  grantsColumnsHelper.accessor("id", {
    id: "grantId",
    header: (ctx) => ctx.table.options.meta?.t("Research.grant.id"),
    cell: (ctx) => (
      <ul className="flex flex-wrap items-center gap-2">
        {ctx.getValue()?.map((id) => (
          <li className="rounded-full bg-form-tag-bg px-2 py-1" key={id}>
            {id}
          </li>
        )) ?? null}
      </ul>
    ),
  }),
];

const researchProjectsColumnsHelper =
  createColumnHelper<ResearchDetailResponse["data"]["researchProject"][number]>();

const researchProjectsColumns = [
  researchProjectsColumnsHelper.accessor("name", {
    id: "researchProjectTitle",
    header: (ctx) => ctx.table.options.meta?.t("Research.researchProject.name"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text ?? "",
  }),
  researchProjectsColumnsHelper.accessor("url", {
    id: "researchProjectId",
    header: (ctx) => ctx.table.options.meta?.t("Research.researchProject.URL"),
    cell: (ctx) => (
      <a
        href={
          ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.url ?? undefined
        }
        className="break-all text-sm"
      >
        {ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text ||
          ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.url ||
          "URL"}
      </a>
    ),
  }),
];
