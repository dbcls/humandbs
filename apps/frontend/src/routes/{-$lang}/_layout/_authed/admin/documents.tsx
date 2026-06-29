import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { FilesIcon } from "lucide-react";
import { z } from "zod";

import { Suspense, useCallback } from "react";

import { CollapsibleCard } from "@/components/CollapsibleCard";
import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { getDocumentQueryOptions, getDocumentsQueryOptions } from "@/serverFunctions/document";
import { getDocumentVersionQueryOptions } from "@/serverFunctions/documentVersion";

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
    q: search.q,
  }),
  loader: async ({ deps, context }) => {
    await context.queryClient.ensureQueryData(getDocumentsQueryOptions({ q: deps.q }));

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
  const { selectedId, selectedVer, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const setSelectedContentId = (contentId: string | undefined) => {
    const documents = queryClient.getQueryData(getDocumentsQueryOptions({ q }).queryKey);
    const latestVersionNumber =
      documents?.find((d) => d.contentId === contentId)?.latestVersionNumber ?? undefined;
    navigate({
      search: (prev) => ({ ...prev, selectedId: contentId, selectedVer: latestVersionNumber }),
    });
  };

  const onSelectVersion = (versionNumber: number) => {
    navigate({ search: (prev) => ({ ...prev, selectedVer: versionNumber }) });
  }

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
