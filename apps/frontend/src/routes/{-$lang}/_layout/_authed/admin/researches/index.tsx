import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { getResearchesInfiniteQueryOptions } from "@/serverFunctions/researches";

import { ResearchDetails } from "./-ResearchDetails";
import { ResearchesList } from "./-ResearchesList";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/researches/",
)({
  component: RouteComponent,
  loader: ({ context }) => {
    context.queryClient.ensureInfiniteQueryData(
      getResearchesInfiniteQueryOptions({ lang: context.lang }),
    );
  },
});

function RouteComponent() {
  const { lang } = Route.useRouteContext();
  const [selectedHumId, setSelectedHumId] = useState<string | null>(null);

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Researches"
        containerClassName="overflow-auto flex-1 max-h-full"
      >
        <Suspense fallback={<Skeleton />}>
          <ResearchesList
            lang={lang}
            selectedHumId={selectedHumId}
            onSelectResearch={setSelectedHumId}
          />
        </Suspense>
      </Card>

      {selectedHumId ? (
        <Suspense fallback={<Skeleton className="h-full flex-1" />}>
          <ResearchDetails
            key={selectedHumId}
            humId={selectedHumId}
            lang={lang}
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
