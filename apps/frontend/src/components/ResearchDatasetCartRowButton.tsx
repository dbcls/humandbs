import { useTranslations } from "use-intl";
import { useShallow } from "zustand/react/shallow";

import { useCallback } from "react";

import { AddToCartToggle } from "@/components/AddToCartToggle";
import { isCartableDatasetId, useCartStore } from "@/hooks/useCart";

export function ResearchDatasetCartRowButton({ datasetId }: { datasetId: string }) {
  const t = useTranslations("common");

  const { isInCart, add, remove } = useCartStore(
    useShallow((state) => ({
      isInCart: state.cartDatasets.includes(datasetId),
      add: state.add,
      remove: state.remove,
    })),
  );

  const handleToggle = useCallback(() => {
    if (isInCart) {
      remove([datasetId]);
    } else {
      add([datasetId]);
    }
  }, [isInCart, add, remove, datasetId]);

  if (!isCartableDatasetId(datasetId)) {
    return <span className="inline-block w-8 shrink-0" aria-hidden="true" />;
  }

  return (
    <AddToCartToggle
      state={isInCart}
      onClick={handleToggle}
      aria-label={isInCart ? t("already-in-cart") : t("add-to-cart")}
    />
  );
}
