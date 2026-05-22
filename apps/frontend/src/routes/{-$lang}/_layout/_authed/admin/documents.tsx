import { createFileRoute } from "@tanstack/react-router";
import { FilesIcon } from "lucide-react";
import { z } from "zod";

import { Suspense, useCallback } from "react";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { FA_ICONS } from "@/lib/faIcons";
import {
  getDocumentVersionListQueryOptions,
  getDocumentVersionQueryOptions,
} from "@/serverFunctions/documentVersion";

import { DocumentsList } from "./-components/DocumentsList";
import { DocumentVersion } from "./-components/DocumentVersion";
import { FallbackDetailsCard } from "./-components/FallbackDetailsCard";
import { NoSelectedItemMessage } from "./-components/NoSelectedItemMessage";

export const Route = createFileRoute("/{-$lang}/_layout/_authed/admin/documents")({
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
        <DocumentsList onSelectDoc={setSelectedContentId} selectedContentId={selectedId} />
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
        <NoSelectedItemMessage icon={<FilesIcon />} />
      )}
    </>
  );
}
