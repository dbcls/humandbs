import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { ResearchDetails } from "./-ResearchDetails";
import { ResearchesList } from "./-ResearchesList";
import { NewResearchForm } from "./-NewResearchForm";
import { authedResearchesListSearchParamsSchema } from "@/utils/queryParams";
import { DUMMY_HUM_ID, isDummyResearch } from "./-dummyResearch";
import { CollapsibleCard } from "@/components/CollapsibleCard";

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
      <CollapsibleCard title="Researches">
        <ResearchesList
          lang={lang}
          selectedHumId={selectedHumId}
          onSelectResearch={setSelectedHumId}
        />
      </CollapsibleCard>

      {selectedHumId && isDummyResearch(selectedHumId) ? (
        <NewResearchForm
          lang={lang}
          onCreated={(humId) => setSelectedHumId(humId)}
        />
      ) : selectedHumId ? (
        <Suspense fallback={<ResearchDetailsFallback humId={selectedHumId} />}>
          <ResearchDetails
            key={selectedHumId}
            humId={selectedHumId}
            lang={lang}
            onDeselect={() => setSelectedHumId(null)}
          />
        </Suspense>
      ) : (
        <div className="text-foreground-light flex flex-1 items-center justify-center">
          No research selected
        </div>
      )}
    </>
  );
}

function ResearchDetailsFallback({ humId }: { humId: string }) {
  return (
    <Card
      className="flex h-full min-w-0 flex-1 flex-col"
      caption={
        <>
          <span>{humId}</span>
          <Skeleton className="ml-3 h-6 w-20" />
          <Skeleton className="ml-3 h-8 w-40" />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-normal text-gray-500">Preview</span>
            <Skeleton className="h-6 w-10 rounded-full" />
          </div>
        </>
      }
      captionClassName="flex items-center"
      containerClassName="flex min-h-0 flex-1 flex-col"
    >
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>

      <div className="px-5 pt-5">
        <div className="flex gap-6">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-5 pt-5 pb-5">
        <div className="mb-5 flex gap-5">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </Card>
  );
}
