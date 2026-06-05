import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useTranslations } from "use-intl";

import { Suspense, useMemo, useState } from "react";

import { ErrorResetBoundary } from "@/components/ErrorResetBoundary";
import { FilterSearchInput } from "@/components/FilterSearchInput";
import { InputDialog } from "@/components/InputDialog";
import { ListItem } from "@/components/ListItem";
import { SkeletonLoadingPanelItems } from "@/components/Skeleton";
import { Label } from "@/components/ui/label";
import { PROTECTED_DOC_IDS } from "@/config/routing-config";
import { useFilters } from "@/hooks/useFilters";
import { cn } from "@/lib/utils";
import type { DocumentsListItemResponse } from "@/serverFunctions/document";
import {
  $changeIdOfDocument,
  $createDocument,
  $deleteDocument,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import type { ValidationResponse } from "@/serverFunctions/validate";
import { $validateEntityId } from "@/serverFunctions/validate";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { AdminListItem } from "./AdminListItem";
import { NoItemsMessage } from "./NoItemsMessage";

const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/documents");

export function DocumentsList({
  onSelectDoc,
  selectedContentId,
}: {
  onSelectDoc: (id: string | undefined) => void;
  selectedContentId: string | undefined;
}) {
  const { q } = routeApi.useSearch();
  const { setFilters } = useFilters(routeApi.id);
  const documentsListQO = getDocumentsQueryOptions({ q });

  const queryClient = useQueryClient();

  const { openConfirmation } = useConfirmationStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);

  const { mutateAsync: createDocument } = useMutation({
    mutationFn: (contentId: string) => $createDocument({ data: { contentId: contentId } }),

    onMutate: async (contentId) => {
      await queryClient.cancelQueries(documentsListQO);

      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(
        documentsListQO.queryKey,
        (oldData: DocumentsListItemResponse[] | undefined) => {
          const optimisticDocument: DocumentsListItemResponse = {
            contentId,
            id: "optimistic-id-" + contentId,
            createdAt: new Date(),
            translations: [],
          };

          if (!oldData) return [optimisticDocument];
          return [...oldData, optimisticDocument];
        },
      );

      return { prevDocList };
    },
    onError: (_, __, context) => {
      if (context?.prevDocList) {
        queryClient.setQueryData(documentsListQO.queryKey, context.prevDocList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(documentsListQO);
    },
  });

  const { mutate: deleteDocument } = useMutation({
    mutationFn: async (contentId: string) => $deleteDocument({ data: { contentId } }),
    onMutate: async (contentId) => {
      await queryClient.cancelQueries(documentsListQO);
      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(
        documentsListQO.queryKey,
        (oldData: DocumentsListItemResponse[] | undefined) => {
          if (!oldData) return [];
          return oldData.filter((doc) => doc.contentId !== contentId);
        },
      );

      return { prevDocList };
    },
    onError: (_, __, context) => {
      if (context?.prevDocList) {
        queryClient.setQueryData(documentsListQO.queryKey, context.prevDocList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(documentsListQO);
    },
  });

  const { mutateAsync: changeIdOfDocument } = useMutation({
    mutationFn: (data: { oldId: string; newId: string }) => $changeIdOfDocument({ data }),
    onMutate: async ({ oldId, newId }) => {
      await queryClient.cancelQueries(documentsListQO);
      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(documentsListQO.queryKey, (oldData) => {
        if (!oldData) return [];
        return oldData.map((doc) => (doc.contentId === oldId ? { ...doc, contentId: newId } : doc));
      });
      return { prevDocList };
    },
    onError: (_, __, context) => {
      if (context?.prevDocList) {
        queryClient.setQueryData(documentsListQO.queryKey, context.prevDocList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(documentsListQO);
    },
  });

  function handleClickDeleteDoc(contentId: string) {
    openConfirmation({
      title: "Delete Document",
      description: `Are you sure you want to delete document ${contentId}?`,
      actionLabel: "Delete",
      onAction: () => {
        onSelectDoc(undefined);
        deleteDocument(contentId);
      },
    });
  }

  async function handleRenameSubmit(newId: string) {
    if (!renamingId) return;
    const oldId = renamingId;
    openConfirmation({
      title: "Change ID of the document",
      description: `Are you sure you want to change ID "${oldId}" to "${newId}"?`,
      actionLabel: "Rename",
      onAction: () => {
        changeIdOfDocument({ oldId, newId });
      },
    });
  }

  const validate = useServerFn($validateEntityId);

  const tErrors = useTranslations("Errors");
  return (
    <>
      <div className="mb-3">
        <FilterSearchInput
          value={q}
          onChange={(nextQ) => setFilters({ q: nextQ })}
          placeholder="Search by title or content…"
        />
      </div>

      <InputDialog
        title="Add Document"
        description=<div>
          <p>Enter content ID in `snake-case`.</p>
          <p>It can have slashes (`hello/world`).</p>
          <p>Content ID would become the path to this document</p>
        </div>
        label="Content ID"
        trigger={<AddNewButton className="mb-5" />}
        validateAsync={async (value) => {
          if (!value || value.length < 1) return "Content ID is required";
          if (value.length > 100) return "Content ID must be 100 characters or less";
          const validationResult = await validate({
            data: value,
          });

          return makeValidationErrorMessage(validationResult, tErrors);
        }}
        onSubmit={(id) => createDocument(id)}
      />

      <InputDialog
        title="Change Document ID"
        description={renamingId ? `Current ID: ${renamingId}` : undefined}
        label="New ID"
        trigger={<span />}
        open={renamingId !== null}
        onOpenChange={(open) => {
          if (!open) setRenamingId(null);
        }}
        validateAsync={async (value) => {
          if (!value || value.length < 1) return "ID is required";
          if (value.length > 100) return "ID must be 100 characters or less";

          const validationResponse = await validate({
            data: value,
          });

          return makeValidationErrorMessage(validationResponse, tErrors);
        }}
        onSubmit={handleRenameSubmit}
      />

      <ErrorResetBoundary getResetKey={() => `${q}`}>
        <Suspense fallback={<SkeletonLoadingPanelItems />}>
          <ListItems
            selectedContentId={selectedContentId}
            onSelectDoc={onSelectDoc}
            onRenameDoc={setRenamingId}
            onDeleteDoc={handleClickDeleteDoc}
          />
        </Suspense>
      </ErrorResetBoundary>
    </>
  );
}

function ListItems({
  selectedContentId,
  onSelectDoc,
  onRenameDoc,
  onDeleteDoc,
}: {
  onSelectDoc: (id: string) => void;
  selectedContentId: string | undefined;
  onRenameDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
}) {
  const { q } = routeApi.useSearch();
  const documentsListQO = getDocumentsQueryOptions({ q });
  const { data: documents } = useSuspenseQuery(documentsListQO);

  const groupedDocs = useMemo(() => {
    const groups = new Map<string, DocumentsListItemResponse[]>();
    for (const doc of documents) {
      const topSegment = doc.contentId.split("/")[0];
      if (!groups.has(topSegment)) groups.set(topSegment, []);
      groups.get(topSegment)!.push(doc);
    }
    for (const docs of groups.values()) {
      docs.sort((a, b) => {
        const aDepth = a.contentId.split("/").length - 1;
        const bDepth = b.contentId.split("/").length - 1;
        if (aDepth !== bDepth) return aDepth - bDepth;
        return a.contentId.localeCompare(b.contentId);
      });
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [documents]);

  if (documents.length === 0) {
    return <NoItemsMessage>No documents found</NoItemsMessage>;
  }
  return (
    <ul className="overflow-y-auto" data-testid="documents-list-ul">
      {groupedDocs.map(([topSegment, docs], groupIndex) => (
        <li key={topSegment}>
          {docs.map((doc, level) => {
            const isActive = doc.contentId === selectedContentId;
            const isProtected = PROTECTED_DOC_IDS.includes(
              doc.contentId as (typeof PROTECTED_DOC_IDS)[number],
            );

            return (
              <ListItem
                key={doc.contentId}
                role="menuitem"
                className={cn("relative mb-2", {
                  "pl-6 before:absolute before:top-0 before:left-1 before:block before:h-full before:w-1 before:bg-gray-200":
                    level > 0,
                })}
                onClick={() => onSelectDoc(doc.contentId)}
                isActive={isActive}
              >
                <AdminListItem
                  id={doc.contentId}
                  translations={doc.translations}
                  menuItems={
                    isProtected
                      ? []
                      : [
                          {
                            label: <Label>Change ID...</Label>,
                            onSelect: () => onRenameDoc(doc.contentId),
                          },
                          {
                            label: (
                              <Label>
                                <Trash2 />
                                Delete
                              </Label>
                            ),
                            onSelect: () => onDeleteDoc(doc.contentId),
                            variant: "destructive",
                          },
                        ]
                  }
                />
              </ListItem>
            );
          })}

          {groupIndex < groupedDocs.length - 1 && <hr className="my-2 border-gray-200" />}
        </li>
      ))}
    </ul>
  );
}

function makeValidationErrorMessage(
  validationResponse: ValidationResponse,
  tErrors: (errorCode: any) => string,
) {
  if (validationResponse.success) return undefined;
  return validationResponse.errors.map((error) => tErrors(error.errorCode)).join(", ");
}
