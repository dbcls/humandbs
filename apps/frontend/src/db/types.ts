import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import * as schema from "./schema";
import { z } from "zod";

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

export const newsItemUpdateSchema = createUpdateSchema(
  schema.newsItem
).required({
  id: true,
});

export const newsItemInsertSchema = createInsertSchema(schema.newsItem);

export const newsTranslationSelectSchema = createSelectSchema(
  schema.newsTranslation
);

export const newsTranslationUpdateSchema = createUpdateSchema(
  schema.newsTranslation
);

export const newsTranslationInsertSchema = createInsertSchema(
  schema.newsTranslation
);

export type NewsTranslationInsert = typeof schema.newsTranslation.$inferInsert;
