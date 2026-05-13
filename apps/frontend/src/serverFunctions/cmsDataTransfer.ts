import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { hasPermissionMiddleware } from "@/middleware/authMiddleware";

export const CMS_DATA_TRANSFER_CATEGORIES = [
  "content",
  "documents",
  "news",
  "alerts",
  "assets",
  "header-footer",
  "flowcharts",
] as const;

export type CmsDataTransferCategory =
  (typeof CMS_DATA_TRANSFER_CATEGORIES)[number];

export const cmsDataTransferCategorySchema = z.enum(
  CMS_DATA_TRANSFER_CATEGORIES,
);

export const CMS_DATA_TRANSFER_CATEGORY_LABELS: Record<
  CmsDataTransferCategory,
  string
> = {
  content: "Content",
  documents: "Documents",
  news: "News",
  alerts: "Alerts",
  assets: "Assets",
  "header-footer": "Header & Footer",
  flowcharts: "Flowcharts",
};

export const MAX_CMS_ARCHIVE_SIZE_BYTES = 1024 * 1024 * 500; // 500 MB

const prepareCmsDataArchiveExportInputSchema = z.object({
  categories: z.array(cmsDataTransferCategorySchema).min(1),
});

export const $prepareCmsDataArchiveExport = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(prepareCmsDataArchiveExportInputSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    return {
      ok: false as const,
      code: "NOT_IMPLEMENTED" as const,
      message:
        "Archive generation will be implemented in the next slice. Category selection is wired and ready.",
      categories: data.categories,
    };
  });

export interface CmsDataArchiveUploadSummary {
  name: string;
  size: number;
  lastModified: number;
}

export const $validateCmsDataArchiveUpload = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const archive = data.get("archive");

    if (!(archive instanceof File)) {
      return {
        ok: false as const,
        code: "MISSING_FILE" as const,
        message: "Select a `.zip` archive before continuing.",
      };
    }

    if (!archive.name.toLowerCase().endsWith(".zip")) {
      return {
        ok: false as const,
        code: "INVALID_FILE_TYPE" as const,
        message: "Only `.zip` archives are supported.",
      };
    }

    if (archive.size <= 0) {
      return {
        ok: false as const,
        code: "EMPTY_FILE" as const,
        message: "The selected archive is empty.",
      };
    }

    if (archive.size > MAX_CMS_ARCHIVE_SIZE_BYTES) {
      return {
        ok: false as const,
        code: "FILE_TOO_LARGE" as const,
        message: `Archive exceeds the current limit of ${Math.floor(
          MAX_CMS_ARCHIVE_SIZE_BYTES / (1024 * 1024),
        )} MB.`,
      };
    }

    return {
      ok: true as const,
      code: "BASIC_VALIDATION_ONLY" as const,
      message:
        "Archive transport checks passed. Deep manifest and payload validation will be added in the next restore slice.",
      archive: {
        name: archive.name,
        size: archive.size,
        lastModified: archive.lastModified,
      } satisfies CmsDataArchiveUploadSummary,
    };
  });
