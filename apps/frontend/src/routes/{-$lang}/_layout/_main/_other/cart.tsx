import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { useRef, useState } from "react";

import { CardWithCaption } from "@/components/Card";
import { CodeSnippet } from "@/components/CodeSnippet";
import { Link } from "@/components/Link";
import { ModalCell } from "@/components/ModalCell";
import { SortHeader, Table } from "@/components/Table";
import { TextWithIcon } from "@/components/TextWithIcon";
import { Button } from "@/components/ui/button";
import { i18n } from "@/config/i18n";
import { useCartStore } from "@/hooks/useCart";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { FA_ICONS } from "@/lib/faIcons";
import type { DatasetDoc } from "@/lib/types";
import { getBatchedDatasetsQueryOptions } from "@/serverFunctions/datasets";

export const Route = createFileRoute("/{-$lang}/_layout/_main/_other/cart")({
  component: RouteComponent,
  loader: ({ context }) => ({ crumb: context.messages?.common?.["cart"] }),
});

const cartColumnsHelper = createColumnHelper<DatasetDoc>();

const cartDatasetColumns = [
  cartColumnsHelper.accessor("datasetId", {
    id: "datasetId",
    header: (ctx) => <SortHeader ctx={ctx} label={ctx.table.options.meta?.t("datasetId")} />,
    cell: (ctx) => {
      const isStub = !ctx.row.original.criteria;
      return (
        <div className="flex flex-col gap-1">
          <Route.Link to="/{-$lang}/dataset/$datasetId" params={{ datasetId: ctx.getValue() }}>
            <TextWithIcon className="text-secondary" icon={FA_ICONS.dataset}>
              {ctx.renderValue()}
            </TextWithIcon>
          </Route.Link>
          {isStub && (
            <span className="text-warning text-xs">
              {ctx.table.options.meta?.t("data-unavailable")}
            </span>
          )}
        </div>
      );
    },
    maxSize: 10,
  }),
  cartColumnsHelper.accessor("experiments", {
    id: "experiments",
    header: (ctx) => ctx.table.options.meta?.t("experiments"),
    cell: (ctx) => (
      <ModalCell>
        <ul className="space-y-4">
          {(ctx.getValue() ?? []).map((item) => (
            <li key={`${item.header.en?.text}-${item.header.ja?.text}`}>
              <span>{item.header?.[ctx.table.options.meta?.lang ?? i18n.defaultLocale]?.text}</span>
            </li>
          ))}
        </ul>
      </ModalCell>
    ),
  }),
  cartColumnsHelper.accessor("criteria", {
    id: "criteria",
    header: (ctx) => ctx.table.options.meta?.t("criteria"),
    cell: (ctx) => ctx.table.options.meta?.t(ctx.getValue()),
  }),
  cartColumnsHelper.display({
    id: "delete",
    cell: function Cell(ctx) {
      const remove = useCartStore((state) => state.remove);

      return (
        <Button
          variant={"plain"}
          onClick={() => {
            remove([ctx.row.original.datasetId]);
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

function CartContents({ cartIds }: { cartIds: string[] }) {
  const t = useTranslations("Dataset");
  const tCommon = useTranslations("common");
  const tCart = useTranslations("Cart");

  const locale = useLocale();

  const [, copy] = useCopyToClipboard();

  const [copied, setCopied] = useState(false);
  const copyLabelTimerRef = useRef<Timer>(null);

  const { data, isPending } = useQuery(getBatchedDatasetsQueryOptions(cartIds, locale));

  const payload = {
    components: cartIds.map((id) => ({
      key: "use_dataset_request",
      value: id,
    })),
  };

  function handleClickCopy() {
    if (copyLabelTimerRef.current) {
      clearTimeout(copyLabelTimerRef.current);
    }

    setCopied(true);
    copyLabelTimerRef.current = setTimeout(() => setCopied(false), 2000);
    copy(JSON.stringify(payload, null, 2));
  }

  if (isPending) {
    return <p className="text-center text-gray-400">Loading...</p>;
  }

  const cartIdSet = new Set(cartIds);
  const found = ((data?.data ?? []) as DatasetDoc[]).filter((d) => cartIdSet.has(d.datasetId));
  const notFoundInCart = (data?.meta.batch.notFound ?? []).filter((id) => cartIdSet.has(id));
  const stubs = notFoundInCart.map((id) => ({ datasetId: id }) as DatasetDoc);
  const datasets = [...found, ...stubs];

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-4">
        <Button onClick={handleClickCopy}>
          <Copy className="mr-2 inline size-6" /> {copied ? tCommon("copied") : tCommon("copy")}
        </Button>
        <Link href={DU_APPLICATION_URL} className="block">
          {tCart("naviagte-to-application-form")}
          <ExternalLink className="ml-2 inline size-6" />
        </Link>
      </div>
      <Table columns={cartDatasetColumns} data={datasets} meta={{ t, lang: locale }} />
      <CodeSnippet code={JSON.stringify(payload, null, 2)} lang="json" />
    </>
  );
}

function RouteComponent() {
  const cartIds = useCartStore((state) => state.cartDatasets);

  return (
    <CardWithCaption size={"sm"} containerClassName="p-8">
      <ClientOnly fallback={<p className="text-center text-gray-400">Loading...</p>}>
        {cartIds.length === 0 ? (
          <p className="text-center text-gray-400">Cart is empty</p>
        ) : (
          <CartContents cartIds={cartIds} />
        )}
      </ClientOnly>
    </CardWithCaption>
  );
}
