import { QueryClient } from "@tanstack/react-query";

export function waitUntilNoMutations(
  client: QueryClient,
  filters?: Parameters<QueryClient["isMutating"]>[0]
): Promise<void> {
  return new Promise((resolve) => {
    if (client.isMutating(filters) === 0) {
      resolve();
      return;
    }

    const unsubscribe = client.getMutationCache().subscribe(() => {
      if (client.isMutating(filters) === 0) {
        unsubscribe();
        resolve();
      }
    });
  });
}
