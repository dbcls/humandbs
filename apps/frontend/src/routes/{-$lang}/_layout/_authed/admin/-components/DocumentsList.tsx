import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { InputDialog } from "@/components/InputDialog";
import { ListItem } from "@/components/ListItem";
import { type ContentId } from "@/config/content-config";
import { PROTECTED_DOC_IDS } from "@/config/routing-config";
import {
  $changeIdOfDocument,
  $createDocument,
  $deleteDocument,
  type DocumentsListItemResponse,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import { $validateEntityId } from "@/serverFunctions/validate";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { AdminListItem } from "./AdminListItem";

export function DocumentsList({
  onSelectDoc,
  selectedContentId,
}: {
  onSelectDoc: (id: string) => void;
  selectedContentId: string | undefined;
}) {
  const documentsListQO = getDocumentsQueryOptions();
  const { data: documents } = useSuspenseQuery(documentsListQO);

  const queryClient = useQueryClient();

  const { openConfirmation } = useConfirmationStore();

  const [renamingId, setRenamingId] = useState<string | null>(null);

  const { mutateAsync: createDocument } = useMutation({
    mutationFn: (contentId: ContentId) =>
      $createDocument({ data: { contentId: contentId } }),

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
    mutationFn: async (contentId: string) =>
      $deleteDocument({ data: { contentId } }),
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
    mutationFn: (data: { oldId: string; newId: string }) =>
      $changeIdOfDocument({ data }),
    onMutate: async ({ oldId, newId }) => {
      await queryClient.cancelQueries(documentsListQO);
      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(documentsListQO.queryKey, (oldData) => {
        if (!oldData) return [];
        return oldData.map((doc) =>
          doc.contentId === oldId ? { ...doc, contentId: newId } : doc,
        );
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

  const groupedDocs = useMemo(() => {
    const groups = new Map<string, DocumentsListItemResponse[]>();
    for (const doc of documents) {
      const topSegment = doc.contentId.split("/")[0];
      if (!groups.has(topSegment)) groups.set(topSegment, []);
      groups.get(topSegment)!.push(doc);
    }
    for (const docs of groups.values()) {
      docs.sort((a, b) => a.contentId.localeCompare(b.contentId));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [documents]);

  return (
    <>
      <InputDialog
        title="Add Document"
        label="Content ID"
        trigger={<AddNewButton className="mb-5" />}
        validateAsync={async (value) => {
          if (!value || value.length < 1) return "Content ID is required";
          if (value.length > 100)
            return "Content ID must be 100 characters or less";
          const isExisting = await $validateEntityId({
            data: value as ContentId,
          });
          if (isExisting) return "Document with this contentId already exists";
          return undefined;
        }}
        onSubmit={(id) => createDocument(id as ContentId)}
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
          const isOk = await $validateEntityId({
            data: value,
          });

          if (!isOk) return "A document with this ID already exists";
          return undefined;
        }}
        onSubmit={handleRenameSubmit}
      />

      <ul className="overflow-y-auto">
        {groupedDocs.map(([topSegment, docs], groupIndex) => (
          <li key={topSegment}>
            <ul>
              {docs
                .filter((doc) => !doc.contentId.includes("/"))
                .map((doc) => {
                  const isActive = doc.contentId === selectedContentId;
                  const isProtected = PROTECTED_DOC_IDS.includes(
                    doc.contentId as (typeof PROTECTED_DOC_IDS)[number],
                  );

                  return (
                    <ListItem
                      key={doc.contentId}
                      role="menuitem"
                      className="mb-2"
                      onClick={() => onSelectDoc(doc.contentId)}
                      isActive={isActive}
                    >
                      <AdminListItem
                        id={doc.contentId}
                        translations={doc.translations}
                        onClickDelete={() =>
                          handleClickDeleteDoc(doc.contentId)
                        }
                        onClickRename={() => setRenamingId(doc.contentId)}
                        hideDelete={isProtected}
                        hideRename={isProtected}
                      />
                    </ListItem>
                  );
                })}
              {docs.some((doc) => doc.contentId.includes("/")) && (
                <ul className="ml-3 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-2">
                  {docs
                    .filter((doc) => doc.contentId.includes("/"))
                    .map((doc) => {
                      const isActive = doc.contentId === selectedContentId;
                      const isProtected = PROTECTED_DOC_IDS.includes(
                        doc.contentId as (typeof PROTECTED_DOC_IDS)[number],
                      );
                      return (
                        <ListItem
                          key={doc.contentId}
                          role="menuitem"
                          className="mb-2"
                          onClick={() => onSelectDoc(doc.contentId)}
                          isActive={isActive}
                        >
                          <AdminListItem
                            id={doc.contentId}
                            translations={doc.translations}
                            onClickDelete={() =>
                              handleClickDeleteDoc(doc.contentId)
                            }
                            onClickRename={() => setRenamingId(doc.contentId)}
                            hideDelete={isProtected}
                            hideRename={isProtected}
                          />
                        </ListItem>
                      );
                    })}
                </ul>
              )}
            </ul>
            {groupIndex < groupedDocs.length - 1 && (
              <hr className="my-2 border-gray-200" />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
