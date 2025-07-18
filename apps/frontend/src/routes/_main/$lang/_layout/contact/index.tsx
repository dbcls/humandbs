import { Markdown } from "@/components/Markdown";
import { SkeletonLoading } from "@/components/Skeleton";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

const contactQueryOptions = queryOptions({
  queryKey: ["contact"],
  queryFn: async () => {
    return fetch(
      "https://raw.githubusercontent.com/tailwindlabs/tailwindcss/refs/heads/main/README.md"
    ).then((res) => res.text());
  },
});

export const Route = createFileRoute("/_main/$lang/_layout/contact/")({
  component: RouteComponent,
  pendingComponent: SkeletonLoading,
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData(contactQueryOptions);
  },
});

/**
 * Dynamically load markdown from any github public repo
 */

function RouteComponent() {
  const { data: markdown } = useSuspenseQuery(contactQueryOptions);

  return <Markdown markdown={markdown} />;
}
