import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/db/database";
import { documentSelectSchema, insertDocumentSchema } from "@/db/types";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createDocumentRepository } from "@/repositories/document";

const documentRepo = createDocumentRepository(db);

// export interface DocumentsListItemResponse {
//   id: string;
//   createdAt: Date;
//   contentId: string;
//   latestVersionNumber: number | null;
//   translations: {
//     lang: (typeof i18n.locales)[number];
//     statuses: {
//       published?: string;
//       draft?: string;
//     };
//   }[];
// }

/** List all documents, ordered by segments */
export const $getDocuments = createServerFn({
  method: "GET",
})
  .middleware([hasPermissionMiddleware])
  .inputValidator(
    z.object({
      q: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    context.checkPermission("documents", "list");

    return await documentRepo.getList(data.q);
  });

export function getDocumentsQueryOptions(params?: { q?: string }) {
  return queryOptions({
    queryKey: ["documents", params],
    queryFn: () => $getDocuments({ data: params ?? {} }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Create new document with given contentId (must be unique)
 */
export const $createDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(insertDocumentSchema)
  .handler(({ context, data }) => {
    context.checkPermission("documents", "create");

    return documentRepo.create(data.contentId, context.user.id);
  });

/** Get a single document by contentId */
export const $getDocument = createServerFn({ method: "GET" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(documentSelectSchema)
  .handler(({ context, data }) => {
    context.checkPermission("documents", "view");

    return documentRepo.getByContentId(data.contentId);
  });

export function getDocumentQueryOptions(contentId: string) {
  return queryOptions({
    queryKey: ["documents", contentId],
    queryFn: () => $getDocument({ data: { contentId } }),
    staleTime: 1000 * 60 * 5,
  });
}

/** Update hideTOC flag for a document */
export const $updateDocumentHideTOC = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ contentId: z.string(), hideTOC: z.boolean() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await documentRepo.updateSettings(data.contentId, { hideTOC: data.hideTOC });
  });

/** Update hideRevisions flag for a document */
export const $updateDocumentHideRevisions = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ contentId: z.string(), hideRevisions: z.boolean() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await documentRepo.updateSettings(data.contentId, { hideRevisions: data.hideRevisions });
  });

/**
 * Delete document by contentId
 */
export const $deleteDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(documentSelectSchema)
  .handler(({ context, data }) => {
    context.checkPermission("documents", "delete");

    return documentRepo.delete(data.contentId);
  });

/**
 * Change Id of document
 */
export const $changeIdOfDocument = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.object({ oldId: z.string(), newId: z.string() }))
  .handler(async ({ context, data }) => {
    context.checkPermission("documents", "update");

    await documentRepo.changeContentId(data.oldId, data.newId);
  });
