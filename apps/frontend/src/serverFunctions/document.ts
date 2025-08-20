import { document } from "@/db/schema";
import { insertDocumentSchema } from "@/db/types";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import z from "zod";

/** List all documents */
export const $getDocuments = createServerFn({
  type: "dynamic",
  method: "GET",
  response: "data",
}).handler(async () => {
  const documents = await db.query.document.findMany();

  return documents;
});

export function getDocumentsQueryOptions() {
  return queryOptions({
    queryKey: ["documents"],
    queryFn: $getDocuments,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Create new document with given contentId (must be unique)
 */
export const $createDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(insertDocumentSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "create");

    const doc = await db.insert(document).values(data).returning();

    return doc;
  });

export const $validateDocumentContentId = createServerFn({ method: "POST" })
  .validator(z.string())
  .handler(async ({ data }) => {
    const existingDoc = await db.query.document.findFirst({
      where: eq(document.contentId, data),
    });

    return !!existingDoc;
  });

/**
 * Delete document by contentId
 */
export const $deleteDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .validator(z.object({ contentId: z.string() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "delete");

    const doc = await db
      .delete(document)
      .where(eq(document.contentId, data.contentId))
      .returning();

    return doc;
  });
