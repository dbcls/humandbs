import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";

import { contentIdSchema } from "@/config/content-config";
import { localeSchema } from "@/config/i18n-config";

import * as schema from "./schema";

export const insertDocumentSchema = createInsertSchema(schema.document);

export const documentSelectSchema = createSelectSchema(schema.document).omit({
  createdAt: true,
});

export const documentVersionSelectSchema = createSelectSchema(
  schema.documentVersion,
  { locale: localeSchema, contentId: contentIdSchema }
);

export type DocumentSelect = z.infer<typeof documentSelectSchema>;

export const userSelectSchema = createSelectSchema(schema.user);

export type User = z.infer<typeof userSelectSchema>;

export const statusSchema = createSelectSchema(schema.documentVersionStatus);

export type DocumentVersionStatus = z.infer<typeof statusSchema>;

// export const selectDocVersionTranslationSelectSchema = createSelectSchema(
//   schema.documentVersionTranslation
// );

// export const documentVersionTranslationWithTranslatorSchema =
//   createSelectSchema(schema.documentVersionTranslation).extend({
//     translator: userSelectSchema,
//   });

// export const documentVersionWithTranslations = createSelectSchema(
//   schema.documentVersion
// ).extend({
//   translations: z.array(documentVersionTranslationWithTranslatorSchema),
// });

// export type DocumentVersionWithTranslations = z.infer<
//   typeof documentVersionWithTranslations
// >;

export const documentVersionSchema = createSelectSchema(schema.documentVersion);

// export const documentVersionData = z.record(
//   statusSchema,
//   documentVersionWithTranslations
// );

// export type DocumentVersionData = z.infer<typeof documentVersionData>;

// export const insertDocumentVersionTranslationSchema = createInsertSchema(
//   schema.documentVersionTranslation
// );

// export type InsertDocumentVersionTranslationParams = z.infer<
//   typeof insertDocumentVersionTranslationSchema
// >;

// export const updateDocumentVersionTranslationSchema = createUpdateSchema(
//   schema.documentVersionTranslation
// ).required({
//   documentVersionId: true,
//   locale: true,
// });

// export type CreateDocumentVersionTranslationParams =
//   typeof schema.documentVersionTranslation.$inferInsert;

export const selectAlertSchema = createSelectSchema(schema.alert);
export const createAlertSchema = createInsertSchema(schema.alert);
export const updateAlertSchema = createUpdateSchema(schema.alert).required({
  newsId: true,
});

export type UpdateAlert = z.infer<typeof updateAlertSchema>;

export const newsTranslationSelectSchema = createSelectSchema(
  schema.newsTranslation
);

export const newsTranslationSelectWithDateStringSchema =
  newsTranslationSelectSchema.transform((v) => ({
    ...v,
    updatedAt: v.updatedAt?.toLocaleDateString(),
  }));

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

export const newsItemSelectSchema = createSelectSchema(schema.newsItem);

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

export type ContentItem = typeof schema.contentItem.$inferSelect;

export const contentTranslationInsertSchema = createInsertSchema(
  schema.contentTranslation
);

export const contentTranslationUpdateSchema = createUpdateSchema(
  schema.contentTranslation
);

export type ContentTranslationSelect =
  typeof schema.contentTranslation.$inferSelect;

export type ContentTranslationInsert = z.infer<
  typeof contentTranslationInsertSchema
>;

export type ContentTranslationUpdate = z.infer<
  typeof contentTranslationUpdateSchema
>;

export type NewsTranslationInsert = typeof schema.newsTranslation.$inferInsert;

export type NewsTranslationSelect = z.infer<typeof newsTranslationSelectSchema>;

export type NewsItem = z.infer<typeof newsItemSelectSchema>;

export type Alert = z.infer<typeof selectAlertSchema>;
