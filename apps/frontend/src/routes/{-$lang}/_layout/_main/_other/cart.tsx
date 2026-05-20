import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { SortHeader, Table } from "@/components/Table";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";

import { ModalCell } from "@/components/ModalCell";
import { TextWithIcon } from "@/components/TextWithIcon";
import { i18n } from "@/config/i18n";
import { FA_ICONS } from "@/lib/faIcons";
import type { DatasetDoc } from "@humandbs/backend/types";
import { createColumnHelper } from "@tanstack/react-table";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  loader: () => ({ crumb: "Cart" }),
});

const cartColumnsHelper = createColumnHelper<DatasetDoc>();

const cartDatasetColumns = [
  // ...datasetsColumns.filter((col) => col.id !== "cart"),
  cartColumnsHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => (
      <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("datasetId")} />
    ),
    cell: (ctx) => (
      <Route.Link
        to="/{-$lang}/dataset/$datasetId"
        params={{ datasetId: ctx.getValue() }}
      >
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
      <ModalCell>
        <ul className="space-y-4">
          {(ctx.getValue() ?? []).map((item, i) => (
            <li key={i}>
              <span>
                {
                  item.header?.[
                    ctx.table.options.meta?.lang ?? i18n.defaultLocale
                  ]?.text
                }
              </span>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  cartColumnsHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    //@ts-ignore TODO fix types`
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
          <Trash2 className="text-danger size-5" />
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
      <ClientOnly fallback={<p className="text-center text-gray-400">Loading...</p>}>
        {cart.length === 0 ? (
          <p className="text-center text-gray-400">Cart is empty</p>
        ) : (
          <>
            <Button className="mb-4 ml-auto" onClick={handleSubmit}>
              Copy Cart Contents
            </Button>
            <Table
              columns={cartDatasetColumns}
              data={cart}
              meta={{ t, lang: locale }}
            />
          </>
        )}
      </ClientOnly>
    </CardWithCaption>
  );
}
