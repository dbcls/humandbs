import { Card } from "@/components/Card";
import { useAppForm } from "@/components/form-context/FormContext";
import { Button } from "@/components/ui/button";
import { i18n, Locale } from "@/lib/i18n-config";
import {
  $getContentItem,
  $upsertContentItemTranslation,
  getContentQueryOptions,
  getContentsListQueryOptions,
} from "@/serverFunctions/contentItem";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect } from "react";

type ContentItem = NonNullable<Awaited<ReturnType<typeof $getContentItem>>>;

type FormData = {
  translations: ContentItem["translations"];
  locale: Locale;
};

export function ContentItemDetails({ id }: { id: string }) {
  const contentItemQO = getContentQueryOptions(id);

  const contentsListQO = getContentsListQueryOptions();

  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery(contentItemQO);

  const { mutate: updateContentTranslations } = useMutation({
    mutationFn: (data: {
      translations: ContentItem["translations"];
      id: string;
    }) => $upsertContentItemTranslation({ data }),

    onMutate: async (data) => {
      await queryClient.cancelQueries(contentItemQO);

      const prevContent = queryClient.getQueryData(contentItemQO.queryKey);
      const prevList = queryClient.getQueryData(contentsListQO.queryKey);

      queryClient.setQueryData(contentItemQO.queryKey, (old) => {
        if (!old)
          return {
            translations: data.translations,
          };

        return data;
      });

      queryClient.setQueryData(contentsListQO.queryKey, (old) => {
        const newItem = {
          id: data.id,
          translations: Object.entries(data.translations).map(
            ([loc, translation]) => ({
              title: translation.title,
              lang: loc as Locale,
            })
          ),
        };
        if (!old) {
          return [newItem];
        }

        const isUpdate = old.some((item) => item.id === data.id);

        if (isUpdate) {
          return old.map((item) => {
            if (item.id === data.id) return newItem;
            return item;
          });
        }
        return [...old, newItem];
      });

      return { prevContent, prevList };
    },

    onError: (_, __, context) => {
      if (context?.prevContent) {
        queryClient.setQueryData(contentItemQO.queryKey, context.prevContent);
      }
      if (context?.prevList) {
        queryClient.setQueryData(contentsListQO.queryKey, context.prevList);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries(contentItemQO);
      queryClient.invalidateQueries(contentsListQO);
    },
  });

  const form = useAppForm({
    defaultValues: {
      locale: i18n.defaultLocale,
      translations: data?.translations || {},
    } as FormData,
    onSubmit: ({ value }) => {
      console.log("form data", value.translations);
      updateContentTranslations({ translations: value.translations, id });
    },
  });

  useEffect(() => {
    form.reset();
  }, [id]);

  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex items-center gap-5">
          <span>Details</span>

          <form.AppField name="locale">
            {(field) => <field.LocaleSwitchField />}
          </form.AppField>
        </span>
      }
    >
      <div className="flex flex-1 flex-col gap-2">
        <form.Subscribe selector={(state) => state.values.locale}>
          {(locale) => {
            return (
              <>
                <form.AppField name={`translations.${locale}.title`}>
                  {(field) => <field.TextField label="Title" />}
                </form.AppField>
                <form.AppField name={`translations.${locale}.content`}>
                  {(field) => <field.ContentAreaField label="Content" />}
                </form.AppField>
              </>
            );
          }}
        </form.Subscribe>

        <Button
          type="submit"
          onClick={form.handleSubmit}
          className="gap-1 self-end"
          size={"lg"}
          variant={"accent"}
        >
          <Save className="size-5" />
          Save
        </Button>
      </div>
    </Card>
  );
}
