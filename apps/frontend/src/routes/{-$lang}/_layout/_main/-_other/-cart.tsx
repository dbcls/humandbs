import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";

import { CardWithCaption } from "@/components/Card";
import { Table } from "@/components/Table";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";

import { datasetsColumnHelper, datasetsColumns } from "./data-usage/datasets";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  loader: () => ({ crumb: "Cart" }),
  ssr: false,
});

const cartDatasetColumns = [
  ...datasetsColumns,
  datasetsColumnHelper.display({
    id: "delete",
    cell: function Cell(ctx) {
      const { remove } = useCart();

      return (
        <Button variant={"plain"} onClick={() => remove(ctx.row.original)}>
          <Trash2 className="text-danger size-5" />
        </Button>
      );
    },
    maxSize: 10,
  }),
];

function RouteComponent() {
  const { cart } = useCart();
  const t = useTranslations("Dataset-list");
  return (
    <CardWithCaption size={"sm"}>
      {cart.length === 0 ? (
        <p className="text-center text-gray-400">Cart is empty</p>
      ) : (
        <Table columns={cartDatasetColumns} data={cart} meta={{ t }} />
      )}
    </CardWithCaption>
  );
}
