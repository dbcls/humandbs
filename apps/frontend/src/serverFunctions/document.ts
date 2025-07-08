import { Document } from "@/db/schema";
import { db } from "@/lib/database";
import { createServerFn } from "@tanstack/react-start";

interface DocumentListItem extends Document {
  locales: string[];
}

/** List all documents */
export const getDocuments = createServerFn({
  type: "dynamic",
  method: "GET",
  response: "data",
}).handler(async () => {
  const documents = await db.query.document.findMany();

  return documents;
});
