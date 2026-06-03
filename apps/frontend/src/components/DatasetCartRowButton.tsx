import { useTranslations } from "use-intl";
import { useShallow } from "zustand/react/shallow";

import { useCallback } from "react";

import { AddToCartToggle } from "@/components/AddToCartToggle";
import { isCartableDatasetId, useCartStore } from "@/hooks/useCart";
import type { DatasetDoc } from "@/lib/types";

export function DatasetCartRowButton({
  dataset,
  className,
}: {
  dataset: DatasetDoc;
  className?: string;
}) {
  const t = useTranslations("common");

  const { add, remove, isInCart } = useCartStore(
    useShallow((state) => ({
      add: state.add,
      isInCart: state.cartDatasets.includes(dataset.datasetId),
      remove: state.remove,
    })),
  );

  const handleToggle = useCallback(
    (dataset: DatasetDoc) => {
      if (isInCart) {
        remove([dataset.datasetId]);
      } else {
        add([dataset.datasetId]);
      }
    },
    [add, remove, isInCart],
  );

  if (!isCartableDatasetId(dataset.datasetId)) {
    return <span className="inline-block w-9 shrink-0" aria-hidden="true" />;
  }

  return (
    <AddToCartToggle
      state={isInCart}
      onClick={() => {
        handleToggle(dataset);
      }}
      className={className}
      aria-label={isInCart ? t("already-in-cart") : t("add-to-cart")}
    />
  );
}
