import { useRouteContext } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { ShoppingCartIcon } from "lucide-react";
import { useMessages, useTranslations } from "use-intl";

import type { DatasetDoc, ResearchDetailResponse } from "@humandbs/backend/types";

import { AddToCartToggle } from "@/components/AddToCartToggle";
import { CardWithCaption } from "@/components/Card";
import { CardCaption } from "@/components/CardCaption";
import { ContentHeader } from "@/components/ContentHeader";
import { KeyValueCard } from "@/components/KeyValueCard";
import { Link } from "@/components/Link";
import { Separator } from "@/components/Separator";
import { Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useCart, useCartTableHeader, useCartTableRow } from "@/hooks/useCart";
import { FA_ICONS } from "@/lib/faIcons";
import { cn } from "@/lib/utils";

export function VersionCard({
  versionData,
  lang: langOverride,
}: {
  versionData: ResearchDetailResponse["data"];
  lang?: "ja" | "en";
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
              className="text-white no-underline"
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
          {versionData?.dataProvider.map((p, i) => {
            return (
              <dl key={i} className="columns-2">
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
    header: (ctx) => {
      const { allInCart, someInCart, handleClickCart } = useCartTableHeader({
        tableDatasets: ctx.table.options.data,
      });

      return (
        <AddToCartToggle
          variant={"header"}
          state={allInCart ? true : someInCart ? "indeterminate" : false}
          onClick={handleClickCart}
        />
      );
    },
    cell: (ctx) => {
      const { handleClickCart, inCart } = useCartTableRow({
        dataset: ctx.row.original,
      });

      return <AddToCartToggle state={inCart} onClick={handleClickCart} />;
    },

    size: 1,
    maxSize: 1,
  }),
  datasetColumnHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => ctx.table.options.meta?.t("datasetId"),
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
    //@ts-expect-error TODO fix types
    cell: (ctx) => ctx.table.options.meta?.t(ctx.getValue()), //<span className="text-sm">{ctx.getValue()}</span>,
    maxSize: 10,
  }),
  datasetColumnHelper.accessor("typeOfData", {
    id: "typeOfData",
    header: (ctx) => ctx.table.options.meta?.t("typeOfData"),
    cell: (ctx) => ctx.getValue()?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale],

    maxSize: 14,
  }),
];

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
