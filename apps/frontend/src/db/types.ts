import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import * as schema from "./schema";
import { z } from "zod";

const documentSchema = createSelectSchema(schema.document);

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
