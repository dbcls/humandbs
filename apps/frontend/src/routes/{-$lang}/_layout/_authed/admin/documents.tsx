import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useCallback, useState } from "react";

import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";

import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersion } from "./-components/DocumentVersion";
import { z } from "zod";
import {
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
} from "@/serverFunctions/documentVersion";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";

export const Route = createFileRoute(
  "/{-$lang}/_layout/_authed/admin/documents",
)({
  validateSearch: z.object({
    selectedId: z.string().optional(),
    selectedVer: z.number().optional(),
    q: z.string().optional(),
  }),
  component: RouteComponent,
  loaderDeps: ({ search }) => ({
    selectedId: search.selectedId,
    selectedVer: search.selectedVer,
  }),
  loader: ({ deps, context }) => {
    context.queryClient.ensureQueryData(
      getDocumentVersionListQueryOptions({
        contentId: deps.selectedId ?? null,
      }),
    );

    if (deps.selectedId && deps.selectedVer) {
      context.queryClient.ensureQueryData(
        getDocumentVersionQueryOptions({
          contentId: deps.selectedId,
          versionNumber: deps.selectedVer,
        }),
      );
    }
  },
});

function RouteComponent() {
  const { selectedId, selectedVer } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setSelectedContentId = useCallback(
    (contentId: string) => {
      navigate({ search: { selectedId: contentId } });
    },
    [navigate],
  );

  const onSelectVersion = useCallback(
    (versionNumber: number) => {
      navigate({ search: (prev) => ({ ...prev, selectedVer: versionNumber }) });
    },
    [navigate],
  );

  return (
    <>
      <Card
        className="w-cms-list-panel flex h-full flex-col"
        caption="Documents"
        containerClassName="flex-1 flex flex-col"
      >
        <Suspense fallback={<Skeleton />}>
          <DocumentsList
            onSelectDoc={setSelectedContentId}
            selectedContentId={selectedId}
          />
        </Suspense>
      </Card>

      {selectedId ? (
        <Suspense fallback={<FallbackDetailsCard />}>
          <DocumentVersion
            key={selectedId}
            contentId={selectedId}
            version={selectedVer}
            onSelectVersion={onSelectVersion}
          />
        </Suspense>
      ) : (
        <div>No document selected</div>
      )}
    </>
  );
}
