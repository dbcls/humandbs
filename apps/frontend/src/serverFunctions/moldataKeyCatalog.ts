import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { hasPermissionMiddleware } from "@/middleware/authMiddleware";
import {
  MoldataKeyCatalogConflictError,
  MoldataKeyCatalogDuplicateKeyError,
  MoldataKeyCatalogValidationError,
  moldataKeyCatalogRepository,
} from "@/repositories/moldataKeyCatalog";

export const $getMoldataKeyCatalog = createServerFn({ method: "GET" }).handler(() =>
  moldataKeyCatalogRepository.get(),
);

export function getMoldataKeyCatalogQueryOptions() {
  return queryOptions({
    queryKey: ["moldata-key-catalog"],
    queryFn: () => $getMoldataKeyCatalog(),
    staleTime: 1000 * 60 * 5,
  });
}

const createMoldataKeyCatalogEntrySchema = z.object({
  english: z.string().trim().min(1, "English is required."),
  japanese: z.string().trim().min(1, "Japanese is required."),
  expectedRevision: z.number().int().min(0),
});

export const $createMoldataKeyCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(createMoldataKeyCatalogEntrySchema)
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    try {
      return {
        ok: true as const,
        data: await moldataKeyCatalogRepository.create(data),
      };
    } catch (error) {
      if (error instanceof MoldataKeyCatalogConflictError) {
        return { ok: false as const, code: "CONFLICT" as const, error: error.message };
      }
      if (error instanceof MoldataKeyCatalogDuplicateKeyError) {
        return { ok: false as const, code: "DUPLICATE" as const, error: error.message };
      }

      throw error;
    }
  });

const catalogEntrySchema = z.object({
  id: z.string().uuid(),
  english: z.string().trim().min(1, "English is required."),
  japanese: z.string().trim().min(1, "Japanese is required."),
});

function catalogMutationResult(error: unknown) {
  if (error instanceof MoldataKeyCatalogConflictError) {
    return { ok: false as const, code: "CONFLICT" as const, error: error.message };
  }
  if (error instanceof MoldataKeyCatalogDuplicateKeyError) {
    return { ok: false as const, code: "DUPLICATE" as const, error: error.message };
  }
  if (error instanceof MoldataKeyCatalogValidationError) {
    return { ok: false as const, code: "VALIDATION" as const, error: error.message };
  }
  throw error;
}

export const $updateMoldataKeyCatalogEntries = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ entries: z.array(catalogEntrySchema), expectedRevision: z.number().int().min(0) }),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");
    try {
      return { ok: true as const, data: await moldataKeyCatalogRepository.updateEntries(data) };
    } catch (error) {
      return catalogMutationResult(error);
    }
  });

export const $reorderMoldataKeyCatalogEntries = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ orderedIds: z.array(z.string().uuid()), expectedRevision: z.number().int().min(0) }),
  )
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");
    try {
      return { ok: true as const, data: await moldataKeyCatalogRepository.reorder(data) };
    } catch (error) {
      return catalogMutationResult(error);
    }
  });

export const $deleteMoldataKeyCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().uuid(), expectedRevision: z.number().int().min(0) }))
  .middleware([hasPermissionMiddleware])
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");
    try {
      return { ok: true as const, data: await moldataKeyCatalogRepository.delete(data) };
    } catch (error) {
      return catalogMutationResult(error);
    }
  });
