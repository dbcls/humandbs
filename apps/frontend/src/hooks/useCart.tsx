import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { useCallback } from "react";

import type { DatasetDoc } from "@/lib/types";

export type CartItem = DatasetDoc;

// const DRA_RREGEX = /^DRA\d+./useCart
// const HUM_REGEX = /^hum\d+\..+$/i;
const JGAD_REGEX = /^JGAD\d+$/i;
/**
 * validates whether the datasetId is belongs to restricted-access or unrestricted-access dataset by its ID
 */
export function isCartableDatasetId(datasetId: string) {
  return JGAD_REGEX.test(datasetId);
}

type CartDatasetStore = {
  cartDatasets: CartItem[];
  add: (datasets: CartItem[]) => void;
  remove: (datasetIds: string[]) => void;
};

export const useCartStore = create<CartDatasetStore>()(
  persist(
    (set) => ({
      cartDatasets: [],
      add: (datasets) => {
        set((state) => {
          const newDatasets = [...state.cartDatasets];
          const cartableDatasets = datasets.filter((ds) => isCartableDatasetId(ds.datasetId));

          cartableDatasets.forEach((dataset) => {
            if (!newDatasets.some((d) => d.datasetId === dataset.datasetId)) {
              newDatasets.push(dataset);
            }
          });
          return { cartDatasets: newDatasets };
        });
      },
      remove: (datasetIds) => {
        set((state) => ({
          cartDatasets: state.cartDatasets.filter((d) => !datasetIds.includes(d.datasetId)),
        }));
      },
    }),
    {
      name: "cart-storage", // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    },
  ),
);

/**
 * Custom hook to toggle all datasets in given array.
 * useful for table header's "add to cart" button.
 * Only re-renders when allInCart or someInCart changes for this specific set.
 */
export function useCartTableHeader({
  tableDatasets,
}: {
  tableDatasets: (CartItem | { datasetId: string })[];
}) {
  const cartableDatasets = tableDatasets.filter((ds) => isCartableDatasetId(ds.datasetId));

  const { allInCart, someInCart, add, remove } = useCartStore(
    useShallow((state) => ({
      allInCart: cartableDatasets.every((ds) =>
        state.cartDatasets.some((d) => d.datasetId === ds.datasetId),
      ),
      someInCart: cartableDatasets.some((ds) =>
        state.cartDatasets.some((d) => d.datasetId === ds.datasetId),
      ),
      add: state.add,
      remove: state.remove,
    })),
  );

  const handleToggleDatasets = useCallback(() => {
    if (allInCart) {
      remove(cartableDatasets.map((ds) => ds.datasetId));
    } else {
      add(cartableDatasets as CartItem[]);
    }
  }, [allInCart, add, remove, cartableDatasets]);

  return { allInCart, someInCart, handleToggleDatasets };
}
