import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { useCallback } from "react";

const JGAD_REGEX = /^JGAD\d+$/i;
const CART_LIMIT = 100;

export function isCartableDatasetId(datasetId: string) {
  return JGAD_REGEX.test(datasetId);
}

type CartDatasetStore = {
  cartDatasets: string[];
  add: (datasetIds: string[]) => void;
  remove: (datasetIds: string[]) => void;
};

export const useCartStore = create<CartDatasetStore>()(
  persist(
    (set) => ({
      cartDatasets: [],
      add: (datasetIds) => {
        set((state) => {
          const toAdd = datasetIds
            .filter(isCartableDatasetId)
            .filter((id) => !state.cartDatasets.includes(id));

          const next = [...state.cartDatasets, ...toAdd];
          return { cartDatasets: next.slice(0, CART_LIMIT) };
        });
      },
      remove: (datasetIds) => {
        set((state) => ({
          cartDatasets: state.cartDatasets.filter((id) => !datasetIds.includes(id)),
        }));
      },
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export function useCartTableHeader({ tableDatasets }: { tableDatasets: { datasetId: string }[] }) {
  const cartableIds = tableDatasets.map((ds) => ds.datasetId).filter(isCartableDatasetId);

  const { allInCart, someInCart, add, remove } = useCartStore(
    useShallow((state) => ({
      allInCart: cartableIds.every((id) => state.cartDatasets.includes(id)),
      someInCart: cartableIds.some((id) => state.cartDatasets.includes(id)),
      add: state.add,
      remove: state.remove,
    })),
  );

  const handleToggleDatasets = useCallback(() => {
    if (allInCart) {
      remove(cartableIds);
    } else {
      add(cartableIds);
    }
  }, [allInCart, add, remove, cartableIds]);

  return { allInCart, someInCart, handleToggleDatasets };
}
