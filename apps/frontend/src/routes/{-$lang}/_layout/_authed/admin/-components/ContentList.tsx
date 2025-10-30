import { ListItem } from "@/components/ListItem";
import { TrashButton } from "@/components/TrashButton";
import {
  $createContentItem,
  $deleteContentItem,
  $validateContentId,
  getContentsListQueryOptions,
} from "@/serverFunctions/contentItem";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Tag } from "./StatusTag";
import { AddNewButton } from "./AddNewButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import useConfirmationStore from "@/stores/confirmationStore";
import { useServerFn } from "@tanstack/react-start";
import { localeSchema } from "@/lib/i18n-config";

export function ContentList({
  selectedContentId,
  onSelectContent,
  onClickAdd,
}: {
  selectedContentId: string | null;
  onSelectContent: (contentId: string) => void;
  onClickAdd: () => void;
}) {
  const queryClient = useQueryClient();

  const contentsListQO = getContentsListQueryOptions();
  const { data: contents } = useSuspenseQuery(contentsListQO);

  const { openConfirmation } = useConfirmationStore();

  const { mutate: deleteContent } = useMutation({
    mutationFn: (id: string) => $deleteContentItem({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries(contentsListQO);
      const prevContentList = queryClient.getQueryData(contentsListQO.queryKey);

      queryClient.setQueryData(contentsListQO.queryKey, (oldData) => {
        if (!oldData) return [];
        return oldData.filter((content) => content.id !== id);
      });

      return { prevContentList };
    },
    onError: (_, __, context) => {
      if (context?.prevContentList) {
        queryClient.setQueryData(
          contentsListQO.queryKey,
          context.prevContentList
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(contentsListQO);
    },
  });

  function handleClickDeleteContentItem(id: string) {
    openConfirmation({
      title: "Delete Content page",
      description: `Are you sure you want to delete content page ${id}?`,
      actionLabel: "Delete",
      onAction: () => deleteContent(id),
    });
  }

  return (
    <ul>
      <li className="mb-5">
        <AddNewDialog />
      </li>
      {contents.map((content) => {
        const isActive = content.id === selectedContentId;

        return (
          <ListItem
            onClick={() => onSelectContent(content.id)}
            key={content.id}
            isActive={isActive}
          >
            <div className="text-sm font-medium">
              <span>{content.id}</span>
              <ul className="space-y-1">
                {content.translations.map((tr) => (
                  <li key={tr.lang} className="flex items-center gap-1 text-xs">
                    <Tag tag={tr.lang} isActive={isActive} />
                    <span>{tr.title}</span>
                  </li>
                ))}
              </ul>
            </div>

            <TrashButton
              onClick={(e) => {
                e.stopPropagation();
                handleClickDeleteContentItem(content.id);
              }}
              isActive={isActive}
            />
          </ListItem>
        );
      })}
    </ul>
  );
}

function AddNewDialog() {
  const [open, setOpen] = useState(false);

  const queryClient = useQueryClient();
  const contentsListQO = getContentsListQueryOptions();

  const { mutate: createContent } = useMutation({
    mutationFn: (id: string) => $createContentItem({ data: { id } }),

    onMutate: async (id) => {
      await queryClient.cancelQueries(contentsListQO);

      const prevContentItems = queryClient.getQueryData(
        contentsListQO.queryKey
      );

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        if (!old) return [];
        return [...old, { id, translations: [] }];
      });

      return { prevContentItems };
    },
    onError: (_, __, context) => {
      if (context?.prevContentItems) {
        queryClient.setQueryData(
          contentsListQO.queryKey,
          context?.prevContentItems
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentsListQO);
    },
  });

  const form = useForm({
    defaultValues: {
      contentId: "",
    },

    onSubmit: async ({ value }) => {
      createContent(value.contentId.trim().replace(/^\/+|\/+$/g, ""));
    },
  });

  const validateContentId = useServerFn($validateContentId);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) form.reset();
        setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <AddNewButton />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-base">Add Content</DialogTitle>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await form.handleSubmit();
            console.log("onSubmit", form.state.fieldMeta.contentId.errors);
            if (form.state.fieldMeta.contentId.errors.length === 0) {
              setOpen(false);
            }
          }}
          className="flex flex-col gap-2"
        >
          <form.Field
            name="contentId"
            validators={{
              onSubmit: z
                .string()
                .min(3)
                .refine(
                  (val) => !localeSchema.safeParse(val.split("/")?.[0]).success,
                  {
                    message: `Please use CMS locale feature. Instead of setting id as "en/hogehoge", set id as "hogehoge" and use Locale selector tab of the Details panel to set the locale.`,
                  }
                ),

              onChangeAsyncDebounceMs: 1000,
              onChangeAsync: z
                .string()
                .refine((val) => validateContentId({ data: val }), {
                  message: "Content with this contentId already exists",
                }),
            }}
          >
            {(field) => {
              return (
                <Label className="block space-y-2">
                  <span>Content ID</span>
                  <Input
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value.trim())}
                  />
                  {!field.state.meta.isValid && (
                    <em
                      role="alert"
                      className="text-danger space-y-1.5 text-xs"
                    >
                      {field.state.meta.errors.map((e) => (
                        <p key={e?.message}>{e?.message}</p>
                      ))}
                    </em>
                  )}
                </Label>
              );
            }}
          </form.Field>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Button type="submit" className="self-end" disabled={!canSubmit}>
                Submit
              </Button>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}
