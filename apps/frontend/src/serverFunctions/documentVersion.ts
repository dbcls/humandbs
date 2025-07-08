import { z } from "zod";

import { documentVersion } from "@/db/schema";
import { db } from "@/lib/database";
import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

/** Read a document version list */
export const getDocumentVersions = createServerFn({
  method: "GET",
  response: "data",
})
  .validator(
    z.object({
      documentId: z.string().uuid(),
    })
  )
  .handler(async ({ data }) => {
    const { documentId } = data;

    const versions = await db.query.documentVersion.findMany({
      where: (table) => eq(table.documentId, documentId),
      with: {
        translations: {
          columns: {
            locale: true,
          },
        },
      },
    });

    console.log("versions", versions);

    return versions;
  });

/** Create document version */
export const createDocumentVersion = createServerFn({
  method: "POST",
  response: "data",
})
  .validator(
    z.object({
      documentId: z.string().uuid(),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    // TODO: Implement permissions
    context.requirePermission("please");

    const user = context.user!;

    const { documentId } = data;

    // Find the latest version number for this document
    const latestVersion = await db.query.documentVersion.findFirst({
      where: (table) => eq(table.documentId, documentId),
      orderBy: (table, { desc }) => [desc(table.versionNumber)],
      columns: { versionNumber: true },
    });

    const newVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const [result] = await db
      .insert(documentVersion)
      .values({
        authorId: user.id,
        documentId,
        versionNumber: newVersionNumber,
      })
      .returning();

    return result;
  });

/** Delete document version */
export const deleteDocumentVersion = createServerFn({
  method: "POST",
  response: "data",
})
  .validator(
    z.object({
      documentId: z.string().uuid(),
      versionNumber: z.number().min(1),
    })
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ data, context }) => {
    // TODO: Implement permissions
    context.requirePermission("please");

    const { documentId, versionNumber } = data;

    const [result] = await db
      .delete(documentVersion)
      .where(
        and(
          eq(documentVersion.documentId, documentId),
          eq(documentVersion.versionNumber, versionNumber)
        )
      )
      .returning();

    return result;
  });
