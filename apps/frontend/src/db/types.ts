import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import * as schema from "./schema";
import { z } from "zod";
import { enumFromStringArray } from "@/lib/utils";
import { localeSchema } from "@/lib/i18n-config";

export const insertDocumentSchema = createInsertSchema(schema.document);

export const userSelectSchema = createSelectSchema(schema.user);

export const userRoleSchema = userSelectSchema.pick({ role: true });

export const statusSchema = createSelectSchema(schema.documentVersionStatus);

export type DocumentVersionStatus = z.infer<typeof statusSchema>;

export const documentVersionTranslationWithTranslatorSchema =
  createSelectSchema(schema.documentVersionTranslation).extend({
    translator: userSelectSchema,
  });

export const documentVersionWithTranslations = createSelectSchema(
  schema.documentVersion
).extend({
  translations: z.array(documentVersionTranslationWithTranslatorSchema),
});

export type DocumentVersionWithTranslations = z.infer<
  typeof documentVersionWithTranslations
>;

export const documentVersionSchema = createSelectSchema(schema.documentVersion);

export const documentVersionData = z.record(
  statusSchema,
  documentVersionWithTranslations
);

export type DocumentVersionData = z.infer<typeof documentVersionData>;

export const insertDocumentVersionTranslationSchema = createInsertSchema(
  schema.documentVersionTranslation
);

export type InsertDocumentVersionTranslationParams = z.infer<
  typeof insertDocumentVersionTranslationSchema
>;

export const updateDocumentVersionTranslationSchema = createUpdateSchema(
  schema.documentVersionTranslation
).required({
  documentVersionId: true,
  locale: true,
});

export type CreateDocumentVersionTranslationParams =
  typeof schema.documentVersionTranslation.$inferInsert;

export const selectAlertSchema = createSelectSchema(schema.alert);
export const createAlertSchema = createInsertSchema(schema.alert);
export const updateAlertSchema = createUpdateSchema(schema.alert).required({
  newsId: true,
});

export type UpdateAlert = z.infer<typeof updateAlertSchema>;

export const newsTranslationSelectSchema = createSelectSchema(
  schema.newsTranslation
);

export const newsTranslationUpdateSchema = createUpdateSchema(
  schema.newsTranslation
);

export const newsTranslationInsertSchema = createInsertSchema(
  schema.newsTranslation
);

export const newsTranslationUpsertSchema = z.partialRecord(
  localeSchema,
  newsTranslationSelectSchema.pick({ title: true, content: true })
);

export type NewsTranslationUpsert = z.infer<typeof newsTranslationUpsertSchema>;

export const newsItemUpdateSchema = createUpdateSchema(schema.newsItem)
  .required({
    id: true,
  })
  .extend({
    alert: createAlertSchema.omit({ newsId: true }).optional().nullable(),
    translations: newsTranslationUpsertSchema,
  });

export const newsItemInsertSchema = createInsertSchema(schema.newsItem).extend({
  alert: createAlertSchema.omit({ newsId: true }).optional(),
});

export type NewsTranslationInsert = typeof schema.newsTranslation.$inferInsert;

export type NewsTranslationSelect = typeof schema.newsTranslation.$inferSelect;
