import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
