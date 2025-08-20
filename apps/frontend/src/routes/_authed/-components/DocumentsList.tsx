import { ListItem } from "@/components/ListItem";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  $createDocument,
  $deleteDocument,
  $validateDocumentContentId,
  getDocumentsQueryOptions,
} from "@/serverFunctions/document";
import useConfirmationStore from "@/stores/confirmationStore";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import z from "zod";

export function DocumentsList({
  onSelectDoc,
  selectedContentId,
}: {
  onSelectDoc: (id: string) => void;
  selectedContentId: string | undefined;
}) {
  const documentsListQO = getDocumentsQueryOptions();
  const { data: documents } = useSuspenseQuery(documentsListQO);

  const t = useTranslations("Navbar");

  const queryClient = useQueryClient();

  const { openConfirmation } = useConfirmationStore();

  const { mutate: createDocument } = useMutation({
    mutationFn: (contentId: string) =>
      $createDocument({ data: { contentId: contentId } }),

    onMutate: async (contentId) => {
      await queryClient.cancelQueries(documentsListQO);

      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(documentsListQO.queryKey, (oldData) => {
        if (!oldData) return [{ id: "new", contentId, createdAt: new Date() }];
        return [...oldData, { id: "new", contentId, createdAt: new Date() }];
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

  const { mutate: deleteDocument } = useMutation({
    mutationFn: async (contentId: string) =>
      $deleteDocument({ data: { contentId } }),
    onMutate: async (contentId) => {
      await queryClient.cancelQueries(documentsListQO);
      const prevDocList = queryClient.getQueryData(documentsListQO.queryKey);

      queryClient.setQueryData(documentsListQO.queryKey, (oldData) => {
        if (!oldData) return [];
        return oldData.filter((doc) => doc.contentId !== contentId);
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
      onAction: () => deleteDocument(contentId),
    });
  }

  const form = useForm({
    defaultValues: {
      contentId: "",
    },

    onSubmit: async ({ value }) => {
      createDocument(value.contentId);
    },
  });

  const [open, setOpen] = useState(false);

  return (
    <ul>
      <li className="mb-5">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant={"accent"} className="w-full">
              Add new
            </Button>
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
                  onChangeAsync: z
                    .string()
                    .min(1)
                    .max(100)
                    .refine(
                      async (value) => {
                        const isExisting = await $validateDocumentContentId({
                          data: value,
                        });
                        return !isExisting;
                      },
                      {
                        message: "Document with this contentId already exists",
                      }
                    ),
                }}
              >
                {(field) => {
                  return (
                    <Label className="block space-y-2">
                      <span>Content ID</span>
                      <Input
                        name={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      {!field.state.meta.isValid && (
                        <em role="alert" className="text-danger text-xs">
                          {field.state.meta.errors
                            .map((e) => e?.message)
                            .join(", ")}
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
      </li>
      {documents.map((doc) => {
        const isActive = doc.contentId === selectedContentId;
        return (
          <ListItem
            key={doc.contentId}
            role="menuitem"
            onClick={() => onSelectDoc(doc.contentId)}
            isActive={isActive}
          >
            <span>{t(doc.contentId as any)} </span>
            <Button
              variant={"ghost"}
              size={"slim"}
              onClick={(e) => {
                e.stopPropagation();
                handleClickDeleteDoc(doc.contentId);
              }}
            >
              <Trash2Icon
                className={cn("text-danger size-5 transition-colors", {
                  "text-white": isActive,
                })}
              />
            </Button>
          </ListItem>
        );
      })}
    </ul>
  );
}
