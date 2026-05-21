import { createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import type { DatasetDoc } from "@humandbs/backend/types";

import { CardWithCaption } from "@/components/Card";
import { CollapsiblePreview } from "@/components/CollapsiblePreview";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useCart } from "@/hooks/useCart";
import { FA_ICONS } from "@/lib/faIcons";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  ssr: false,
  loader: () => ({ crumb: "Cart" }),
});

const cartColumnsHelper = createColumnHelper<DatasetDoc>();

const cartDatasetColumns = [
  // ...datasetsColumns.filter((col) => col.id !== "cart"),
  cartColumnsHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("datasetId")} />,
    cell: (ctx) => (
      <Route.Link to="/{-$lang}/dataset/$datasetId" params={{ datasetId: ctx.getValue() }}>
        <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
          {ctx.renderValue()}
        </TextWithIcon>
      </Route.Link>
    ),
    maxSize: 10,
  }),
  cartColumnsHelper.accessor("experiments", {
    id: "experiments",
    header: (ctx) => ctx.table.options.meta?.t("experiments"),
    cell: (ctx) => (
      <CollapsiblePreview
        items={ctx.getValue().map((item, i) => ({
          id: i,
          content: (
            <span>{item.header?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text}</span>
          ),
        }))}
      />
    ),
  }),
  cartColumnsHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    //@ts-expect-error TODO fix types`
    cell: (ctx) => ctx.table.options.meta?.t(ctx.getValue()),
  }),

  cartColumnsHelper.display({
    id: "delete",
    cell: function Cell(ctx) {
      const { remove } = useCart();

      return (
        <Button
          variant={"plain"}
          onClick={() => {
            remove(ctx.row.original);
          }}
        >
          <Trash2 className="size-5 text-danger" />
        </Button>
      );
    },
    maxSize: 2,
    size: 2,
  }),
];

function RouteComponent() {
  const { cart } = useCart();
  const t = useTranslations("Dataset");
  const locale = useLocale();

  function handleSubmit() {
    const payload = {
      language_type: locale === "ja" ? 1 : 2,
      components: cart.map((item) => ({
        key: "use_dataset_request",
        value: item.datasetId,
      })),
    };
    console.log("Copied to clipboard:", JSON.stringify(payload, null, 2));
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  }

  return (
    <CardWithCaption size={"sm"} containerClassName="p-8">
      {cart.length === 0 ? (
        <p className="text-center text-gray-400">Cart is empty</p>
      ) : (
        <>
          <Button className="mb-4 ml-auto" onClick={handleSubmit}>
            Copy Cart Contents
          </Button>
          <Table columns={cartDatasetColumns} data={cart} meta={{ t, lang: locale }} />
        </>
      )}
    </CardWithCaption>
  );
}
