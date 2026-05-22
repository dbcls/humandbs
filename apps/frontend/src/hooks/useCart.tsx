import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";

import { useCallback, useEffect } from "react";

import type { DatasetDoc } from "@/lib/types";

const keyFor = (userId: string | undefined) => `cart:${userId}`;

export type CartItem = DatasetDoc;

export function isCartableDatasetId(datasetId: string) {
  return !datasetId.startsWith("DRA");
}

function isQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

const getLocalStorageValues = createIsomorphicFn()
  .client((userId: string | undefined): CartItem[] => {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  })
  .server(() => {
    // Server-side rendering doesn't have access to localStorage, so we return an empty cart.
    return [];
  });

export function useCart() {
  const { user } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();

  const { data: cart = [] } = useQuery<CartItem[]>({
    queryKey: ["cart", user?.id],
    queryFn: () => getLocalStorageValues(user?.id),
    initialData: () => getLocalStorageValues(user?.id),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(user?.id), JSON.stringify(cart));
    } catch (error) {
      if (isQuotaExceeded(error)) {
        console.warn("Cart data exceeds localStorage quota and cannot be saved.");
      } else {
        throw error;
      }
    }
  }, [cart, user?.id]);

  const setCart = (updater: (prev: CartItem[]) => CartItem[]) => {
    queryClient.setQueryData<CartItem[]>(["cart", user?.id], (prev) => updater(prev ?? []));
  };

  return {
    cart,
    add: (dataset: CartItem) => {
      if (!isCartableDatasetId(dataset.datasetId)) return;

      setCart((prev) =>
        prev.some((item) => item.datasetId === dataset.datasetId) ? prev : [...prev, dataset],
      );
    },
    addMany: (datasets: CartItem[]) => {
      setCart((prev) => {
        const datasetIdsInCart = new Set(prev.map((item) => item.datasetId));
        const newDatasets = datasets.filter(
          (dataset) =>
            isCartableDatasetId(dataset.datasetId) && !datasetIdsInCart.has(dataset.datasetId),
        );

        return newDatasets.length ? [...prev, ...newDatasets] : prev;
      });
    },
    remove: (dataset: CartItem) => {
      setCart((prev) => prev.filter((item) => item.datasetId !== dataset.datasetId));
    },
    clear: () => {
      setCart(() => []);
    },
  };
}

/**
 * Hook for adding to cart after redirect
 */
export function useAutoAddToCart(data: DatasetDoc) {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate({
    from: "/{-$lang}/dataset/$datasetId",
  });
  const { add } = useCart();
  const { addToCart } = useSearch({ strict: false });

  useEffect(() => {
    if (!addToCart || !user?.id) return;
    add(data);
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, addToCart: undefined }),
      replace: true,
    });
  }, [addToCart, user?.id, add, navigate, data]);
}

/**
 * Custom hook to toggle all datasets in given array.
 * useful for table header's "add to cart" button.
 */
export function useCartTableHeader({
  tableDatasets,
}: {
  tableDatasets: (CartItem | { datasetId: string })[];
}) {
  const { add, remove, cart } = useCart();
  const cartableDatasets = tableDatasets.filter((dataset) =>
    isCartableDatasetId(dataset.datasetId),
  );

  const datasetIdsInCart = cart.map((item) => item.datasetId);

  const hasDatasets = cartableDatasets.length > 0;

  const allInCart =
    hasDatasets && cartableDatasets.every((ds) => datasetIdsInCart.includes(ds.datasetId));

  const someInCart = cartableDatasets.some((ds) => datasetIdsInCart.includes(ds.datasetId));

  const handleClickCart = useCallback(() => {
    if (allInCart) {
      cartableDatasets.forEach((dataset) => {
        remove(dataset as DatasetDoc);
      });
    } else {
      cartableDatasets.forEach((dataset) => {
        if (!datasetIdsInCart.includes(dataset.datasetId)) {
          add(dataset as DatasetDoc);
        }
      });
    }
  }, [cartableDatasets, datasetIdsInCart, allInCart, add, remove]);

  return {
    handleClickCart,
    allInCart,
    someInCart,
  };
}

export function useCartTableRow({ dataset }: { dataset: DatasetDoc }): {
  handleClickCart: () => void;
  inCart: boolean;
} {
  const { add, remove, cart } = useCart();

  const inCart = cart.some((item) => item.datasetId === dataset.datasetId);

  function handleClickCart() {
    if (inCart) {
      remove(dataset);
    } else {
      add(dataset);
    }
  }

  return {
    handleClickCart,
    inCart,
  };
}
