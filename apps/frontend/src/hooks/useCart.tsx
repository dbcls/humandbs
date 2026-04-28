import { type DatasetDoc } from "@humandbs/backend/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useNavigate,
  useRouteContext,
  useSearch,
} from "@tanstack/react-router";
import { useEffect } from "react";

const keyFor = (userId: string | undefined) => `cart:${userId}`;

export type CartItem = DatasetDoc;

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
      updater(prev ?? []),
    );
  };

  return {
    cart,
    add: (dataset: CartItem) => {
      setCart((prev) =>
        prev.some((item) => item.datasetId === dataset.datasetId)
          ? prev
          : [...prev, dataset],
      );
    },
    remove: (dataset: CartItem) => {
      setCart((prev) =>
        prev.filter((item) => item.datasetId !== dataset.datasetId),
      );
    },
    clear: () => {
      setCart(() => []);
    },
  };
}

export function useAutoAddToCart(data: DatasetDoc) {
  const { user } = useRouteContext({ from: "__root__" });
  const navigate = useNavigate({
    from: "/{-$lang}/dataset/$datasetId",
  });
  const { add } = useCart();
  const { addToCart } = useSearch({ strict: false });

  useEffect(() => {
    if (!addToCart || !user) return;
    add(data);
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, addToCart: undefined }),
      replace: true,
    });
  }, [addToCart, user?.id]);
}
