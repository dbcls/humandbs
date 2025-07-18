import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import * as schema from "./schema";

export const documentVersionTranslationSchema = createSelectSchema(
  schema.documentVersionTranslation
);
export const insertDocumentVersionTranslationSchema = createInsertSchema(
  schema.documentVersionTranslation
);

export const updateDocumentVersionTranslationSchema = createUpdateSchema(
  schema.documentVersionTranslation
).required({
  documentVersionId: true,
  locale: true,
});

export type CreateDocumentVersionTranslationParams =
  typeof schema.documentVersionTranslation.$inferInsert;

export const userSelectSchema = createSelectSchema(schema.user);

export const userRoleSchema = userSelectSchema.pick({ role: true });

export const newsItemUpdateSchema = createUpdateSchema(schema.newsItem);
export const newsItemInsertSchema = createInsertSchema(schema.newsItem);

export const newsTranslationUpdateSchema = createUpdateSchema(
  schema.newsTranslation
);

export const newsTranslationInsertSchema = createInsertSchema(
  schema.newsTranslation
);
