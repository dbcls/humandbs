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
  loader: async ({ context }) => {
    const content =
      await context.queryClient.ensureQueryData(contactQueryOptions);
    return { content, crumb: context.messages.Navbar.contact };
  },
});

/**
 * Dynamically load markdown from any github public repo
 */

function RouteComponent() {
  const { content } = Route.useLoaderData();

  return <Markdown markdown={content} />;
}
