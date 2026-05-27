import { useTranslations } from "use-intl";

import { AddToCartToggle } from "@/components/AddToCartToggle";
import { isCartableDatasetId, useCartTableRow } from "@/hooks/useCart";
import type { DatasetDoc } from "@/lib/types";

export function DatasetCartRowButton({
  dataset,
  className,
}: {
  dataset: DatasetDoc;
  className?: string;
}) {
  const t = useTranslations("common");
  const { handleClickCart, inCart } = useCartTableRow({
    dataset,
  });

  if (!isCartableDatasetId(dataset.datasetId)) {
    return <span className="inline-block w-9 shrink-0" aria-hidden="true" />;
  }

  return (
    <AddToCartToggle
      state={inCart}
      onClick={handleClickCart}
      className={className}
      aria-label={inCart ? t("already-in-cart") : t("add-to-cart")}
    />
  );
}
