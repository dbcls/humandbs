import { ClientOnly, useRouteContext } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { useMessages, useTranslations } from "use-intl";

import type { ResearchDetailResponse } from "@humandbs/backend/types";

import { AccessCriteriaLabel } from "@/components/AccessCriteriaLabel";
import { AddToCartToggle } from "@/components/AddToCartToggle";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Link } from "@/components/Link";
import { ResearchDatasetCartRowButton } from "@/components/ResearchDatasetCartRowButton";
import { Separator } from "@/components/Separator";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import type { Locale } from "@/config/i18n";
import { i18n } from "@/config/i18n";
import { useCartTableHeader } from "@/hooks/useCart";
import { FA_ICONS } from "@/lib/faIcons";

export function VersionCard({
  versionData,
  lang: langOverride,
}: {
  versionData: ResearchDetailResponse["data"];
  lang?: Locale;
}) {
  const { lang: routeLang } = useRouteContext({ from: "/{-$lang}/_layout" });
  const t = useTranslations("Research");
  const lang = langOverride ?? routeLang ?? i18n.defaultLocale;
  const messages = useMessages();

  const tableMeta = {
    lang,
    t,
    messages,
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
        <div className="columns-2 [&>p>span]:mr-2 [&>p>span]:font-extrabold [&>p]:mb-4">
          <p>
            <span>{t("aims")}:</span>
            {versionData.summary.aims[lang]?.text}
          </p>
          <p>
            <span>{t("methods")}:</span>
            {versionData.summary.methods[lang]?.text}
          </p>
          <p>
            <span>{t("targets")}:</span>
            {versionData.summary.targets[lang]?.text}
          </p>
        </div>
      </article>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("datasets")}</ContentHeader>
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
        <ContentHeader>{t("dataProvider")}</ContentHeader>
        <ul>
          {versionData?.dataProvider.map((p) => {
            return (
              <dl key={`${p.name.ja?.text}-${p.name.en?.text}`} className="columns-2">
                <KeyValueCard title={t("representative")} value={p.name[lang]?.text ?? ""} />
                <KeyValueCard
                  title={t("organization")}
                  value={p.organization?.name[lang]?.text ?? ""}
                />
                <KeyValueCard
                  title={t("periodOfDataUse")}
                  value={`${p.periodOfDataUse?.startDate || ""} - ${p.periodOfDataUse?.endDate || ""}`}
                />
                <KeyValueCard title={t("researchTitle")} value={p.researchTitle?.[lang] ?? ""} />
                <KeyValueCard title="ORCID" value={p.orcid} />
                <KeyValueCard title="Dataset IDs" value={p.datasetIds?.join(", ")} />
              </dl>
            );
          })}
        </ul>
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("researchProject.self")}</ContentHeader>
        <Table
          className="mt-4 text-sm"
          columns={researchProjectsColumns}
          data={versionData.researchProject}
          meta={tableMeta}
        />
      </section>
      <section>
        <ContentHeader>{t("grant.self")}</ContentHeader>
        <Table
          className="mt-4 text-sm"
          columns={grantsColumns}
          data={versionData.grant}
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("relatedPublication")}</ContentHeader>
        <Table
          columns={makePublicationColumns(t)}
          data={versionData?.relatedPublication || []}
          className="mt-4 text-sm"
          meta={tableMeta}
        />
      </section>
      <Separator className="-mx-4" />
      <section>
        <ContentHeader>{t("controlledAccessUser")}</ContentHeader>
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
    header: (ctx) => <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("datasetId")} />,
    cell: (ctx) => (
      <Link to="/{-$lang}/dataset/$datasetId" params={{ datasetId: ctx.getValue() }}>
        <TextWithIcon icon={FA_ICONS.books}>{ctx.getValue()}</TextWithIcon>
      </Link>
    ),
    maxSize: 12,
  }),
  datasetColumnHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    cell: (ctx) => <AccessCriteriaLabel criteria={ctx.getValue()} />, //<span className="text-sm">{ctx.getValue()}</span>,
    maxSize: 10,
  }),
  datasetColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => ctx.table.options.meta?.t("typeOfData"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale],

    maxSize: 14,
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
              <Link to="/{-$lang}/dataset/$datasetId" params={{ datasetId }}>
                <TextWithIcon icon={FA_ICONS.dataset}>{datasetId}</TextWithIcon>
              </Link>
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
    id: "name",
    header: (ctx) => ctx.table.options.meta?.messages?.Person.name,
    cell: (ctx) => ctx.getValue()[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
  dataUsedByColumnsHelper.accessor("organization.name", {
    id: "org.name",
    header: (ctx) => ctx.table.options.meta?.t("organization"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text,
  }),
  dataUsedByColumnsHelper.accessor("periodOfDataUse", {
    id: "periodOfDataUse",
    header: (ctx) => ctx.table.options.meta?.t("periodOfDataUse"),
    cell: (ctx) => {
      const v = ctx.getValue();
      if (!v) return null;

      return `${v.startDate} — ${v.endDate || ""}`;
    },
  }),
];

const grantsColumnsHelper = createColumnHelper<ResearchDetailResponse["data"]["grant"][number]>();

const grantsColumns = [
  grantsColumnsHelper.accessor("title", {
    id: "grantTitle",
    header: (ctx) => ctx.table.options.meta?.t("grant.title"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  grantsColumnsHelper.accessor("agency.name", {
    id: "grantAgency",
    header: (ctx) => ctx.table.options.meta?.t("grant.agency"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale] ?? "",
  }),
  grantsColumnsHelper.accessor("id", {
    id: "grantId",
    header: (ctx) => ctx.table.options.meta?.t("grant.id"),
    cell: (ctx) => (
      <ul className="flex items-center gap-2">
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
    header: (ctx) => ctx.table.options.meta?.t("researchProject.name"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text ?? "",
  }),
  researchProjectsColumnsHelper.accessor("url", {
    id: "researchProjectId",
    header: (ctx) => ctx.table.options.meta?.t("researchProject.URL"),
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
