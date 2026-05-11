import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { FilterSearchInput } from "@/components/FilterSearchInput";
import { InputDialog } from "@/components/InputDialog";
import { ListItem } from "@/components/ListItem";
import { localeSchema } from "@/config/i18n";
import { useFilters } from "@/hooks/useFilters";
import {
  $createContentItem,
  $deleteContentItem,
  getContentsListQueryOptions,
} from "@/serverFunctions/contentItem";
import { $validateEntityId } from "@/serverFunctions/validate";
import useConfirmationStore from "@/stores/confirmationStore";

import { AddNewButton } from "./AddNewButton";
import { AdminListItem } from "./AdminListItem";
import { useTranslations } from "use-intl";

const routeApi = getRouteApi("/{-$lang}/_layout/_authed/admin/content");

export function ContentList({
  selectedContentId,
  onSelectContent,
}: {
  selectedContentId: string | undefined;
  onSelectContent: (contentId: string | undefined) => void;
}) {
  const queryClient = useQueryClient();
  const { q } = routeApi.useSearch();
  const { setFilters } = useFilters("/{-$lang}/_layout/_authed/admin/content");

  const contentsListQO = getContentsListQueryOptions({ q });
  const { data: contents } = useSuspenseQuery(contentsListQO);

  const { openConfirmation } = useConfirmationStore();

  const { mutateAsync: createContent } = useMutation({
    mutationFn: (id: string) => $createContentItem({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries(contentsListQO);
      const prevContentItems = queryClient.getQueryData(
        contentsListQO.queryKey,
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
          context.prevContentItems,
        );
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries(contentsListQO);
    },
  });

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
          context.prevContentList,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(contentsListQO);
    },
  });

  const validateContentId = useServerFn($validateEntityId);

  function handleClickDeleteContentItem(id: string) {
    openConfirmation({
      title: "Delete Content page",
      description: `Are you sure you want to delete content page ${id}?`,
      actionLabel: "Delete",
      onAction: () => {
        deleteContent(id);
        onSelectContent(undefined);
      },
    });
  }

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
        title="Add Content"
        label="Content ID"
        trigger={<AddNewButton className="mb-5" />}
        submitSchema={z
          .string()
          .min(3)
          .refine(
            (val) => !localeSchema.safeParse(val.split("/")?.[0]).success,
            {
              message: `Please use CMS locale feature. Instead of setting id as "en/hogehoge", set id as "hogehoge" and use Locale selector tab of the Details panel to set the locale.`,
            },
          )}
        validateAsync={async (val) => {
          const validationResult = await validateContentId({ data: val });
          if (!validationResult.success)
            return validationResult.errors
              .map((error) => tErrors(error.errorCode as any))
              .join(", ");
          return undefined;
        }}
        transformValue={(val) => val.replace(/^\/+|\/+$/g, "")}
        onSubmit={createContent}
      />

      <ul className="overflow-y-auto">
        {contents.map((content) => {
          const isActive = content.id === selectedContentId;

          return (
            <ListItem
              onClick={() => {
                onSelectContent(content.id);
              }}
              key={content.id}
              isActive={isActive}
              className="mb-2 last:mb-0"
            >
              <AdminListItem
                id={content.id}
                translations={content.translations.map((tr) => ({
                  lang: tr.lang,
                  statuses: tr.statuses,
                }))}
                menuItems={[
                  {
                    label: "Delete",
                    onSelect: () => handleClickDeleteContentItem(content.id),
                    variant: "destructive",
                  },
                ]}
              />
            </ListItem>
          );
        })}
      </ul>
    </>
  );
}
