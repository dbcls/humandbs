import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";

const keyFor = (userId: string | undefined) => `cart:${userId}`;

export type CartItem = { datasetId: string; version: string };

export function useCart() {
  const { user } = useRouteContext({ from: "__root__" });
  const queryClient = useQueryClient();

  const { data: cart = [] } = useQuery<CartItem[]>({
    queryKey: ["cart", user?.id],
    queryFn: () => {
      const raw = localStorage.getItem(keyFor(user?.id));
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    localStorage.setItem(keyFor(user?.id), JSON.stringify(cart));
  }, [cart, user?.id]);

  const setCart = (updater: (prev: CartItem[]) => CartItem[]) => {
    queryClient.setQueryData<CartItem[]>(["cart", user?.id], (prev) =>
      updater(prev ?? [])
    );
  };

  return {
    cart,
    add(dataset: CartItem) {
      setCart((prev) =>
        prev.some(
          (item) =>
            item.datasetId === dataset.datasetId &&
            item.version === dataset.vertion
        )
          ? prev
          : [...prev, dataset]
      );
    },
    remove(dataset: CartItem) {
      setCart((prev) =>
        prev.filter(
          (item) =>
            item.datasetId !== dataset.datasetId &&
            item.version !== dataset.version
        )
      );
    },
    clear() {
      setCart(() => []);
    },
  };
}
