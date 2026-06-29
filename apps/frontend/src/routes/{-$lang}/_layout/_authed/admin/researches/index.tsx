import { createFileRoute } from "@tanstack/react-router";

import { Suspense, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorContent, ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { FA_ICONS } from "@/lib/faIcons";
import { authedResearchesListSearchParamsSchema } from "@/utils/query-params";

import { NoSelectedItemMessage } from "../-components/NoSelectedItemMessage";
import { NewResearchForm } from "./-components/NewResearchForm";
import { ResearchDetails } from "./-components/ResearchDetails";
import { ResearchesList } from "./-components/ResearchesList";
import { DUMMY_HUM_ID, isDummyResearch } from "./-components/utils/dummyResearch";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/researches/")({
  validateSearch: authedResearchesListSearchParamsSchema,
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  const { lang, queryClient } = Route.useRouteContext();
  const { selectedHumId, selectedVersion } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setSelectedHumId = (humId: string | null) => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedHumId: humId ?? undefined,
        selectedVersion: undefined,
      }),
    });
  };

  const setSelectedVersion = (version: string) => {
    navigate({ search: (prev) => ({ ...prev, selectedVersion: version }) });
  };

  const [pendingAccessions, setPendingAccessions] = useState<string[]>([]);

  const removeDummyResearch = () => {
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

  function handleDiscardNewResearch() {
    removeDummyResearch();
    setSelectedHumId(null);
    setPendingAccessions([]);
  }

  // Clean up dummy entry when navigating away from this route
  // biome-ignore lint/correctness/useExhaustiveDependencies: we are using react compiler, so removeDummyResearch is stable
  useEffect(() => {
    return () => {
      removeDummyResearch();
    };
  }, []);

  return (
    <>
      <CollapsibleCard title="Researches">
        <ResearchesList
          lang={lang}
          selectedHumId={selectedHumId ?? null}
          onSelectResearch={setSelectedHumId}
        />
      </CollapsibleCard>

      {selectedHumId && isDummyResearch(selectedHumId) ? (
        <NewResearchForm
          lang={lang}
          onCreated={(humId, relatedAccessions) => {
            setPendingAccessions(relatedAccessions);
            setSelectedHumId(humId);
          }}
          onDiscard={handleDiscardNewResearch}
        />
      ) : selectedHumId ? (
        <ErrorResetBoundary
          getResetKey={() => selectedHumId}
          errorComponent={(props) => (
            <Card className="flex-1" caption={<span>{selectedHumId}</span>}>
              <ErrorContent {...props} />
            </Card>
          )}
        >
          <Suspense fallback={<ResearchDetailsFallback humId={selectedHumId} />}>
            <ResearchDetails
              key={`${selectedHumId}-${selectedVersion ?? ""}`}
              humId={selectedHumId}
              lang={lang}
              selectedVersion={selectedVersion}
              onVersionChange={setSelectedVersion}
              initialRelatedAccessions={pendingAccessions}
            />
          </Suspense>
        </ErrorResetBoundary>
      ) : (
        <NoSelectedItemMessage icon={FA_ICONS.books} />
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
            <span className="font-normal text-gray-500 text-sm">Preview</span>
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
