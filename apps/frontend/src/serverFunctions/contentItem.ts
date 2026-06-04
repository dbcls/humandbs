import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/router-core";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Locale } from "@/config/i18n";
import { localeSchema } from "@/config/i18n";
import { db } from "@/db/database";
import { contentItem, DOCUMENT_VERSION_STATUS } from "@/db/schema";
import type { ContentTranslationSelect, DocumentVersionStatus } from "@/db/types";
import { contentTranslationInsertSchema, statusSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import type {
  ContentItemRaw,
  ContentItemSearchQuery,
  ContentItemsListItemRaw,
} from "@/repositories/contentItem";
import { createContentRepo } from "@/repositories/contentItem";

const contentRepo = createContentRepo(db);

export function getContentsListQueryOptions(params?: ContentItemSearchQuery) {
  return queryOptions({
    queryKey: ["contents", params],
    queryFn: () => $getContentItems({ data: params ?? {} }),
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // 5 minutes,
  });
}

export function getContentQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["contents", id],
    queryFn: () => $getContentItem({ data: id }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

const $getContentItems = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      q: z.string().optional(),
    }),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }): Promise<ContentItemsListItemRaw[]> => {
    context.checkPermission("contents", "list");

    return await contentRepo.getItems(data);
  });

export type ContentTranslationResponse = Omit<ContentTranslationSelect, "lang" | "contentId">;

export const $getContentItem = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }): Promise<ContentItemRaw> => {
    const item = await contentRepo.getItem(data);

    if (!item) {
      throw notFound();
    }

    return item;
  });

/** Update hideTOC flag for a content item */
export const $updateContentItemHideTOC = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ id: z.string(), hideTOC: z.boolean() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "update");

    await contentRepo.updateItemHideTOC(data.id, data.hideTOC);
  });

export function getContentTranslationQueryOptions(data: {
  id: string;
  lang: Locale;
  status?: DocumentVersionStatus;
}) {
  return queryOptions({
    queryKey: ["contents", data.id, data.lang, data.status || DOCUMENT_VERSION_STATUS.PUBLISHED],
    queryFn: () =>
      $getContentItemTranslation({
        data: {
          id: data.id,
          lang: data.lang,
          status: data.status || DOCUMENT_VERSION_STATUS.PUBLISHED,
        },
      }),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

const getContentItemTranslationParamsSchema = z.object({
  id: z.string(),
  lang: localeSchema,
  status: statusSchema,
});

export type GetContentItemTranslationParams = z.infer<typeof getContentItemTranslationParamsSchema>;

/**
 * Get content published translation
 */
export const $getContentItemTranslation = createServerFn({
  method: "GET",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(getContentItemTranslationParamsSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("contents", "view");

    const { id, lang, status } = data;

    const translation = await contentRepo.getItemTranslation(id, lang, status);

    return translation;
  });

export const $getPublishedContentItemTranslation = createServerFn()
  .inputValidator(
    z.object({
      id: z.string(),
      lang: localeSchema,
    }),
  )
  .handler(async ({ data }) => {
    const { id, lang } = data;

    const translation = await contentRepo.getItemTranslation(
      id,
      lang,
      DOCUMENT_VERSION_STATUS.PUBLISHED,
    );

    return translation;
  });

export const $isExistingContentItemSplat = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }) => {
    return await contentRepo.isExists(data);
  });

export const $createContentItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    }),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "create");

    return await contentRepo.create(data.id, context.user.id);
  });

export const $deleteContentItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    }),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "delete");

    const id = data.id;

    const deletedContentItem = await db
      .delete(contentItem)
      .where(eq(contentItem.id, id))
      .returning();

    return deletedContentItem[0];
  });

// Save/Create draft
const upsertContentItemDataSchema = contentTranslationInsertSchema.pick({
  title: true,
  content: true,
});

export type UpsertContentItemData = z.infer<typeof upsertContentItemDataSchema>;

const selectContentItemSchema = z.object({
  id: z.string(),
  lang: localeSchema,
});

export type UpcertContentItemData = z.infer<typeof upsertContentItemDataSchema>;

const upsertContentItemTranslationDraftSchema = z.object({
  translation: upsertContentItemDataSchema,
  ...selectContentItemSchema.shape,
});

export type UpsertContentItemDraftTranslationParams = z.infer<
  typeof upsertContentItemTranslationDraftSchema
>;

export const $saveContentItemTranslationDraft = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(upsertContentItemTranslationDraftSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("contents", "update");

    return await contentRepo.saveTranslationDraft(data.id, data.lang, data.translation);
  });

export type SelectContentItemParams = z.infer<typeof selectContentItemSchema>;

// Publish draft
export type PublishContentItemResponse = ContentTranslationSelect & {
  status: typeof DOCUMENT_VERSION_STATUS.PUBLISHED;
};

export const $publishContentItemDraftTranslation = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(selectContentItemSchema)
  .handler(async ({ data, context }): Promise<PublishContentItemResponse> => {
    context.checkPermission("contents", "update");

    return await contentRepo.publishTranslationDraft(data.id, data.lang);
  });

// Unpublish - delete published
export const $unpublishContentItemTranslation = createServerFn({
  method: "POST",
})
  .inputValidator(selectContentItemSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("contents", "update");

    await contentRepo.unpublishTranslation(data.id, data.lang);
  });

// reset draft to currently available published translation. if no translasion is published, throw an error
export const $resetContentItemTranslationDraft = createServerFn({
  method: "POST",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(selectContentItemSchema)
  .handler(async ({ data, context }) => {
    context.checkPermission("contents", "update");

    return await contentRepo.resetDraft(data.id, data.lang);
  });
