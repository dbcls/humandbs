import { createFileRoute, redirect } from "@tanstack/react-router";
import { FilesIcon } from "lucide-react";
import { z } from "zod";

import { Suspense, useCallback } from "react";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { getDocumentQueryOptions } from "@/serverFunctions/document";
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
  loader: async ({ deps, context }) => {
    if (!deps.selectedId) {
      return;
    }

    const document = await context.queryClient.ensureQueryData(
      getDocumentQueryOptions(deps.selectedId),
    );

    if (!document) {
      throw redirect({
        to: Route.to,
        search: (prev) => ({
          ...prev,
          selectedId: undefined,
          selectedVer: undefined,
        }),
      });
    }

    await context.queryClient.ensureQueryData(
      getDocumentVersionListQueryOptions({
        contentId: deps.selectedId,
      }),
    );

    if (deps.selectedVer) {
      try {
        await context.queryClient.ensureQueryData(
          getDocumentVersionQueryOptions({
            contentId: deps.selectedId,
            versionNumber: deps.selectedVer,
          }),
        );
      } catch {
        throw redirect({
          to: Route.to,
          search: (prev) => ({
            ...prev,
            selectedVer: undefined,
          }),
        });
      }
    }
  },
});

function RouteComponent() {

  
  const { selectedId, selectedVer } = Route.useSearch();
  const navigate = Route.useNavigate();

  const setSelectedContentId = useCallback(
    (contentId: string | undefined) => {

      navigate({ search: { selectedId: contentId }});
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
