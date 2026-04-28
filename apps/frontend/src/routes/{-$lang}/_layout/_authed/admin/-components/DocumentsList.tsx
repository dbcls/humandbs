import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { ListItem } from "@/components/ListItem";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ContentId } from "@/config/content-config";
import { PROTECTED_DOC_IDS } from "@/config/routing-config";
import {
  $createDocument,
  $deleteDocument,
  type DocumentsListItemResponse,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { AdminListItem } from "./AdminListItem";
import { Button } from "@/components/ui/button";
import { $validateEntityId } from "@/serverFunctions/validate";

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

  const { mutate: createDocument } = useMutation({
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

  const form = useForm({
    defaultValues: {
      contentId: "",
    },

    onSubmit: async ({ value }) => {
      createDocument(value.contentId as ContentId);
    },
  });

  const [open, setOpen] = useState(false);

  const groupedDocs = useMemo(() => {
    const groups = new Map<string, DocumentsListItemResponse[]>();
    for (const doc of documents) {
      const topSegment = doc.contentId.split("/")[0];
      if (!groups.has(topSegment)) groups.set(topSegment, []);
      groups.get(topSegment)!.push(doc);
    }
    // Within each group sort: parent first, then children alphabetically
    for (const docs of groups.values()) {
      docs.sort((a, b) => a.contentId.localeCompare(b.contentId));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [documents]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <AddNewButton className="mb-5" />
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="text-base">Add Document</DialogTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
              setOpen(false);
            }}
            className="flex flex-col gap-2"
          >
            <form.Field
              name="contentId"
              validators={{
                onChangeAsyncDebounceMs: 500,
                onChangeAsync: async ({ value }) => {
                  if (!value || value.length < 1) {
                    return "Content ID is required";
                  }
                  if (value.length > 100) {
                    return "Content ID must be 100 characters or less";
                  }
                  const isExisting = await $validateEntityId({
                    data: value as ContentId,
                  });
                  if (isExisting) {
                    return "Document with this contentId already exists";
                  }
                  return undefined;
                },
              }}
            >
              {(field) => {
                return (
                  <Label className="block space-y-2">
                    <span>Content ID</span>
                    <Input
                      name={field.name}
                      value={field.state.value}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                    />
                    {!field.state.meta.isValid && (
                      <em role="alert" className="text-danger text-xs">
                        {field.state.meta.errors.join(", ")}
                      </em>
                    )}
                  </Label>
                );
              }}
            </form.Field>
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <Button
                  type="submit"
                  className="self-end"
                  disabled={!canSubmit}
                >
                  Submit
                </Button>
              )}
            </form.Subscribe>
          </form>
        </DialogContent>
      </Dialog>

      <ul className="overflow-y-auto">
        {groupedDocs.map(([topSegment, docs], groupIndex) => (
          <li key={topSegment}>
            <ul>
              {docs.filter((doc) => !doc.contentId.includes("/")).map((doc) => {
                const isActive = doc.contentId === selectedContentId;
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
                      onClickDelete={(e) => {
                        e.stopPropagation();
                        handleClickDeleteDoc(doc.contentId);
                      }}
                      hideDelete={PROTECTED_DOC_IDS.includes(
                        doc.contentId as (typeof PROTECTED_DOC_IDS)[number],
                      )}
                    />
                  </ListItem>
                );
              })}
              {docs.some((doc) => doc.contentId.includes("/")) && (
                <ul className="ml-3 flex flex-col gap-0.5 border-l-2 border-gray-200 pl-2">
                  {docs.filter((doc) => doc.contentId.includes("/")).map((doc) => {
                    const isActive = doc.contentId === selectedContentId;
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
                          onClickDelete={(e) => {
                            e.stopPropagation();
                            handleClickDeleteDoc(doc.contentId);
                          }}
                          hideDelete={PROTECTED_DOC_IDS.includes(
                            doc.contentId as (typeof PROTECTED_DOC_IDS)[number],
                          )}
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
