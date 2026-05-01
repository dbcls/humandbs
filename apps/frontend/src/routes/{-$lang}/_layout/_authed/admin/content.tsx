import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useCallback } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { ContentItemDetails } from "./-components/ContentItemDetails";
import { ContentList } from "./-components/ContentList";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";

import { z } from "zod";
import { getContentQueryOptions } from "@/serverFunctions/contentItem";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/content")(
  {
    validateSearch: z.object({
      selectedId: z.string().optional(),
    }),
    loaderDeps: ({ search }) => ({
      selectedId: search.selectedId,
    }),
    loader: ({ deps, context }) => {
      if (deps.selectedId) {
        context.queryClient.ensureQueryData(
          getContentQueryOptions(deps.selectedId),
        );
      }
    },
    component: RouteComponent,
  },
);

function RouteComponent() {
  const { selectedId } = Route.useSearch();

  const navigate = Route.useNavigate();

  const setSelectedId = useCallback(
    (contentId: string | undefined) => {
      navigate({ search: { selectedId: contentId } });
    },
    [navigate],
  );

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Content"
        containerClassName="flex-1 flex flex-col"
      >
        <p className="mb-5 text-sm">"Oprhan pages" list</p>
        <Suspense fallback={<Skeleton />}>
          <ContentList
            selectedContentId={selectedId}
            onSelectContent={setSelectedId}
          />
        </Suspense>
      </Card>
      {selectedId && (
        <Suspense fallback={<FallbackDetailsCard />}>
          <ContentItemDetails key={selectedId} id={selectedId} />
        </Suspense>
      )}
    </>
  );
}
