import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useCallback } from "react";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import {
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
} from "@/serverFunctions/documentVersion";
import { z } from "zod";
import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersion } from "./-components/DocumentVersion";
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
      <CollapsibleCard title="Documents">
        <DocumentsList
          onSelectDoc={setSelectedContentId}
          selectedContentId={selectedId}
        />
      </CollapsibleCard>

      {selectedId ? (
        <ErrorResetBoundary getResetKey={() => selectedId}>
          <Suspense fallback={<FallbackDetailsCard />}>
            <DocumentVersion
              key={selectedId}
              contentId={selectedId}
              version={selectedVer}
              onSelectVersion={onSelectVersion}
            />
          </Suspense>
        </ErrorResetBoundary>
      ) : (
        <div>No document selected</div>
      )}
    </>
  );
}
