import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { Table } from "@/components/Table";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";

import { datasetsColumnHelper, datasetsColumns } from "./data-use/datasets";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  ssr: false,
  loader: () => ({ crumb: "Cart" }),
});

const cartDatasetColumns = [
  ...datasetsColumns,
  datasetsColumnHelper.display({
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
    maxSize: 10,
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
    <CardWithCaption size={"sm"}>
      {cart.length === 0 ? (
        <p className="text-center text-gray-400">Cart is empty</p>
      ) : (
        <>
          <Button className="ml-auto mb-4" onClick={handleSubmit}>
            Copy Cart Contents
          </Button>
          <Table
            columns={cartDatasetColumns}
            data={cart}
            meta={{ t, lang: locale }}
          />
        </>
      )}
    </CardWithCaption>
  );
}
