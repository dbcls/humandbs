import { documentVersionTranslation } from "@/db/schema";
import {
  insertDocumentVersionTranslationSchema,
  updateDocumentVersionTranslationSchema,
} from "@/db/types";
import { db } from "@/lib/database";
import { localeSchema } from "@/lib/i18n-config";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

/** Get document version translation */
export const getDocumentVersionTranslation = createServerFn({
  method: "GET",
  response: "data",
})
  .validator(
    z.object({
      locale: localeSchema,
      documentVersionId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { locale, documentVersionId } = data;

    const translation = await db.query.documentVersionTranslation.findFirst({
      where: (table) =>
        eq(table.documentVersionId, documentVersionId) &&
        eq(table.locale, locale),
      with: {
        translator: true,
        version: true,
      },
    });

    return translation || null;
  });

/** Create document version translation */
export const createDocumentVersionTranslation = createServerFn({
  method: "POST",
})
  .validator(insertDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.requirePermission("please");

    const user = context.user!;

    return await db
      .insert(documentVersionTranslation)
      .values({ ...data, translatedBy: user.id })
      .returning();
  });

/** Update Translation by versionId and locale */
export const updateDocumentVersiontranslation = createServerFn({
  method: "POST",
})
  .validator(updateDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.requirePermission("please");

    return await db
      .update(documentVersionTranslation)
      .set({ content: data.content, updatedAt: new Date() })
      .where(
        and(
          eq(
            documentVersionTranslation.documentVersionId,
            data.documentVersionId
          ),
          eq(documentVersionTranslation.locale, data.locale)
        )
      )
      .returning();
  });

/** Delete document version translation */

export const deleteDocumentVersiontranslation = createServerFn({
  method: "POST",
})
  .validator(updateDocumentVersionTranslationSchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.requirePermission("please");

    return await db
      .delete(documentVersionTranslation)
      .where(
        and(
          eq(
            documentVersionTranslation.documentVersionId,
            data.documentVersionId
          ),
          eq(documentVersionTranslation.locale, data.locale)
        )
      );
  });
