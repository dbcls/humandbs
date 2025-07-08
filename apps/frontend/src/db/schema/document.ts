import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentId: text("name").notNull(), // id for i18n to translate
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
