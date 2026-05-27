import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import type { DatasetDoc } from "@/lib/types";

const keyFor = (userId: string | undefined) => `cart:${userId}`;

export type CartItem = DatasetDoc;

// const DRA_RREGEX = /^DRA\d+$/i;
// const HUM_REGEX = /^hum\d+\..+$/i;
const JGAD_REGEX = /^JGAD\d+$/i;
/**
 * validates whether the datasetId is belongs to restricted-access or unrestricted-access dataset by its ID
 */
export function isCartableDatasetId(datasetId: string) {
  return JGAD_REGEX.test(datasetId);
}

function isQuotaExceeded(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function writeToLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    if (isQuotaExceeded(error)) {
      console.warn("Cart data exceeds localStorage quota and cannot be saved.");
    } else {
      throw error;
    }
  }
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

// ---------------------------------------------------------------------------
// Fine-grained cart selector — only re-renders when the selected value changes.
// Uses useSyncExternalStore to subscribe directly to the query cache so we can
// apply a selector and skip re-renders when the derived value is unchanged.
// ---------------------------------------------------------------------------
function useCartSelector<T>(
  userId: string | undefined,
  selector: (cart: CartItem[]) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const queryClient = useQueryClient();
  const queryKey = ["cart", userId];

  // Always-current refs so subscribe/getSnapshot callbacks don't go stale.
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const lastResultRef = useRef<T>(
    selector((queryClient.getQueryData<CartItem[]>(queryKey) ?? getLocalStorageValues(userId))),
  );

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.query.queryKey[0] === "cart" &&
          event.query.queryKey[1] === userId
        ) {
          const cart = (event.query.state.data as CartItem[] | undefined) ?? [];
          const next = selectorRef.current(cart);
          if (!isEqualRef.current(lastResultRef.current, next)) {
            lastResultRef.current = next;
            onStoreChange();
          }
        }
      });
      return unsubscribe;
    },
    [queryClient, userId],
  );

  const getSnapshot = useCallback(() => {
    // Prefer cached query data. Fall back to lastResultRef to avoid calling
    // getLocalStorageValues on every snapshot read (it returns a new array
    // each time, which would break useSyncExternalStore's stable-result requirement).
    const cachedCart = queryClient.getQueryData<CartItem[]>(queryKey);
    if (cachedCart === undefined) return lastResultRef.current;
    const next = selectorRef.current(cachedCart);
    if (isEqualRef.current(lastResultRef.current, next)) return lastResultRef.current;
    lastResultRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, userId]);

  return useSyncExternalStore(subscribe, getSnapshot, () =>
    selectorRef.current(getLocalStorageValues(userId)),
  );
}

// ---------------------------------------------------------------------------
// Cart write operations — stable, no subscription to cart data needed.
// ---------------------------------------------------------------------------
function useCartMutations(userId: string | undefined) {
  const queryClient = useQueryClient();

  const setCart = useCallback(
    (updater: (prev: CartItem[]) => CartItem[]) => {
      queryClient.setQueryData<CartItem[]>(["cart", userId], (prev) => {
        const next = updater(prev ?? []);
        writeToLocalStorage(keyFor(userId), JSON.stringify(next));
        return next;
      });
    },
    [queryClient, userId],
  );

  return {
    setCart,
    add: useCallback(
      (dataset: CartItem) => {
        if (!isCartableDatasetId(dataset.datasetId)) return;
        setCart((prev) =>
          prev.some((item) => item.datasetId === dataset.datasetId) ? prev : [...prev, dataset],
        );
      },
      [setCart],
    ),
    addMany: useCallback(
      (datasets: CartItem[]) => {
        setCart((prev) => {
          const datasetIdsInCart = new Set(prev.map((item) => item.datasetId));
          const newDatasets = datasets.filter(
            (dataset) =>
              isCartableDatasetId(dataset.datasetId) && !datasetIdsInCart.has(dataset.datasetId),
          );
          return newDatasets.length ? [...prev, ...newDatasets] : prev;
        });
      },
      [setCart],
    ),
    remove: useCallback(
      (dataset: CartItem) => {
        setCart((prev) => prev.filter((item) => item.datasetId !== dataset.datasetId));
      },
      [setCart],
    ),
    removeMany: useCallback(
      (datasetIds: string[]) => {
        const ids = new Set(datasetIds);
        setCart((prev) => prev.filter((item) => !ids.has(item.datasetId)));
      },
      [setCart],
    ),
    clear: useCallback(() => {
      setCart(() => []);
    }, [setCart]),
  };
}

// ---------------------------------------------------------------------------
// Public hooks
// ---------------------------------------------------------------------------

export function useCart() {
  const { user } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();

  // Ensure the query is initialised in the cache (needed on first mount).
  // We read directly rather than subscribing — callers that need reactivity
  // should use useCartSelector or the specific hooks below.
  const initialised = useRef(false);
  if (!initialised.current) {
    if (!queryClient.getQueryData(["cart", user?.id])) {
      queryClient.setQueryData(["cart", user?.id], getLocalStorageValues(user?.id));
    }
    initialised.current = true;
  }

  const cart = useCartSelector(user?.id, (c) => c, (a, b) => a === b);
  const mutations = useCartMutations(user?.id);

  return { cart, ...mutations };
}

/**
 * Hook for adding to cart after redirect
 */
export function useAutoAddToCart(data: DatasetDoc) {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate({
    from: "/{-$lang}/dataset/$datasetId",
  });
  const { add } = useCartMutations(user?.id);
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
 * Only re-renders when allInCart or someInCart changes for this specific set.
 */
export function useCartTableHeader({
  tableDatasets,
}: {
  tableDatasets: (CartItem | { datasetId: string })[];
}) {
  const { user } = useRouteContext({ from: "__root__" });
  const { addMany, removeMany } = useCartMutations(user?.id);

  const cartableIds = tableDatasets
    .filter((d) => isCartableDatasetId(d.datasetId))
    .map((d) => d.datasetId);

  const cartableIdsRef = useRef(cartableIds);
  cartableIdsRef.current = cartableIds;

  const { allInCart, someInCart } = useCartSelector(
    user?.id,
    (cart) => {
      const inCart = new Set(cart.map((item) => item.datasetId));
      const ids = cartableIdsRef.current;
      const hasDatasets = ids.length > 0;
      const allIn = hasDatasets && ids.every((id) => inCart.has(id));
      const someIn = ids.some((id) => inCart.has(id));
      return { allInCart: allIn, someInCart: someIn };
    },
    (a, b) => a.allInCart === b.allInCart && a.someInCart === b.someInCart,
  );

  const cartableDatasetsRef = useRef(tableDatasets);
  cartableDatasetsRef.current = tableDatasets;

  const handleClickCart = useCallback(() => {
    const cartable = cartableDatasetsRef.current.filter((d) => isCartableDatasetId(d.datasetId));
    if (allInCart) {
      removeMany(cartable.map((d) => d.datasetId));
    } else {
      addMany(cartable as DatasetDoc[]);
    }
  }, [allInCart, addMany, removeMany]);

  return { handleClickCart, allInCart, someInCart };
}

export function useCartTableRow({ dataset }: { dataset: DatasetDoc }): {
  handleClickCart: () => void;
  inCart: boolean;
} {
  const { user } = useRouteContext({ from: "__root__" });
  const { add, remove } = useCartMutations(user?.id);
  const { datasetId } = dataset;

  // Only re-renders when this specific dataset's membership changes.
  const inCart = useCartSelector(
    user?.id,
    (cart) => cart.some((item) => item.datasetId === datasetId),
  );

  const datasetRef = useRef(dataset);
  datasetRef.current = dataset;

  const handleClickCart = useCallback(() => {
    if (inCart) {
      remove(datasetRef.current);
    } else {
      add(datasetRef.current);
    }
  }, [inCart, add, remove]);

  return { handleClickCart, inCart };
}
