import { createFileRoute } from "@tanstack/react-router";
import { Pen } from "lucide-react";
import { z } from "zod";

import { Suspense } from "react";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { getContentQueryOptions } from "@/serverFunctions/contentItem";

import { ContentItemDetails } from "./-components/ContentItemDetails";
import { ContentList } from "./-components/ContentList";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";
import { NoSelectedItemMessage } from "./-components/NoSelectedItemMessage";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/content")({
  validateSearch: z.object({
    selectedId: z.string().optional(),
    q: z.string().optional(),
  }),
  loaderDeps: ({ search }) => ({
    selectedId: search.selectedId,
  }),
  loader: ({ deps, context }) => {
    if (deps.selectedId) {
      context.queryClient.ensureQueryData(getContentQueryOptions(deps.selectedId));
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { selectedId } = Route.useSearch();

  const navigate = Route.useNavigate();

  const setSelectedId = (contentId: string | undefined) => {
    navigate({ search: (prev) => ({ ...prev, selectedId: contentId }) });
  };

  return (
    <>
      <CollapsibleCard title={"Content"}>
        <p className="mb-5 text-sm">"Oprhan pages" list</p>

        <ContentList selectedContentId={selectedId} onSelectContent={setSelectedId} />
      </CollapsibleCard>
      {selectedId ? (
        <Suspense fallback={<FallbackDetailsCard />}>
          <ContentItemDetails key={selectedId} id={selectedId} />
        </Suspense>
      ) : (
        <NoSelectedItemMessage icon={<Pen />} />
      )}
    </>
  );
}
