import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { ResearchDetails } from "./-ResearchDetails";
import { ResearchesList } from "./-ResearchesList";
import { NewResearchForm } from "./-NewResearchForm";
import { authedResearchesListSearchParamsSchema } from "@/utils/queryParams";
import { DUMMY_HUM_ID, isDummyResearch } from "./-dummyResearch";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/",
)({
  validateSearch: authedResearchesListSearchParamsSchema,
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  const { lang, queryClient } = Route.useRouteContext();
  const [selectedHumId, setSelectedHumId] = useState<string | null>(null);

  // Clean up dummy entry when navigating away from this route
  useEffect(() => {
    return () => {
      queryClient.setQueriesData<{
        pages: Array<{ data: Array<{ humId: string }> }>;
        pageParams: unknown[];
      }>({ queryKey: ["researches", "list", "infinite"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.filter((r) => r.humId !== DUMMY_HUM_ID),
          })),
        };
      });
    };
  }, [queryClient]);

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Researches"
        containerClassName="flex flex-1 min-h-0 max-h-full overflow-hidden"
      >
        <ResearchesList
          lang={lang}
          selectedHumId={selectedHumId}
          onSelectResearch={setSelectedHumId}
        />
      </Card>

      {selectedHumId && isDummyResearch(selectedHumId) ? (
        <NewResearchForm
          lang={lang}
          onCreated={(humId) => setSelectedHumId(humId)}
        />
      ) : selectedHumId ? (
        <Suspense fallback={<Skeleton className="h-full flex-1" />}>
          <ResearchDetails
            key={selectedHumId}
            humId={selectedHumId}
            lang={lang}
            onDeselect={() => setSelectedHumId(null)}
          />
        </Suspense>
      ) : (
        <div className="flex flex-1 items-center justify-center text-foreground-light">
          No research selected
        </div>
      )}
    </>
  );
}
