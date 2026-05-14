import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  $$createCmsDataTransferArchive,
  $$restoreCmsDataTransferArchive,
  inspectCmsDataTransferArchive,
} from "@/lib/cmsDataTransferArchive";
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

export interface CmsDataArchiveUploadSummary {
  name: string;
  size: number;
  lastModified: number;
  schemaVersion: 1;
  archiveFormat: "tar.gz";
  createdAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string;
  } | null;
  categories: CmsDataTransferCategory[];
  availableCategories: CmsDataTransferCategory[];
  counts: Partial<Record<CmsDataTransferCategory, number>>;
  assetFileCount: number;
}

function getArchiveValidationError(archive: File) {
  const lowerName = archive.name.toLowerCase();

  if (
    !lowerName.endsWith(".tar.gz") &&
    !lowerName.endsWith(".tgz") &&
    !lowerName.endsWith(".tar")
  ) {
    return {
      ok: false as const,
      code: "INVALID_FILE_TYPE" as const,
      message: "Only `.tar.gz`, `.tgz`, and `.tar` archives are supported.",
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

  return null;
}

const downloadCmsDataArchiveInputSchema = z.object({
  categories: z
    .array(cmsDataTransferCategorySchema)
    .min(1)
    .transform((categories) =>
      CMS_DATA_TRANSFER_CATEGORIES.filter((category) =>
        categories.includes(category),
      ),
    ),
});

export const $downloadCmsDataArchive = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(downloadCmsDataArchiveInputSchema)
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const user = context.user;

    const { bytes } = await $$createCmsDataTransferArchive({
      categories: data.categories,
      createdBy: user
        ? {
            id: user.id,
            email: user.email ?? "",
            name: user.name ?? "",
          }
        : null,
    });

    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d{3}Z$/, "Z");

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename=\"cms-data-export-${timestamp}.tar.gz\"`,
        "Cache-Control": "no-store",
      },
    });
  });

export const $prepareCmsDataArchiveExport = $downloadCmsDataArchive;

export const $restoreCmsDataArchive = createServerFn({ method: "POST" })
  .middleware([hasPermissionMiddleware])
  .inputValidator(z.instanceof(FormData))
  .handler(async ({ context, data }) => {
    context.checkPermission("admin-panel", "view-cms");

    const archive = data.get("archive");

    if (!(archive instanceof File)) {
      return {
        ok: false as const,
        code: "MISSING_FILE" as const,
        message: "Select a `.tar.gz` archive before continuing.",
      };
    }

    const validationError = getArchiveValidationError(archive);
    if (validationError) {
      return validationError;
    }

    const rawCategories = data.getAll("category");
    const parsedCategories = z
      .array(cmsDataTransferCategorySchema)
      .min(1)
      .safeParse(rawCategories);

    if (!parsedCategories.success) {
      return {
        ok: false as const,
        code: "MISSING_CATEGORIES" as const,
        message: "Select at least one archive category to restore.",
      };
    }

    try {
      const result = await $$restoreCmsDataTransferArchive({
        fileName: archive.name,
        bytes: new Uint8Array(await archive.arrayBuffer()),
        categories: parsedCategories.data,
        restoredByUserId: context.user?.id,
      });

      return {
        ok: true as const,
        code: "RESTORE_COMPLETED" as const,
        message: "CMS data restore completed.",
        result,
      };
    } catch (error) {
      return {
        ok: false as const,
        code: "RESTORE_FAILED" as const,
        message:
          error instanceof Error ? error.message : "CMS data restore failed.",
      };
    }
  });

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
        message: "Select a `.tar.gz` archive before continuing.",
      };
    }

    const validationError = getArchiveValidationError(archive);
    if (validationError) {
      return validationError;
    }

    try {
      const summary = await inspectCmsDataTransferArchive({
        fileName: archive.name,
        fileSize: archive.size,
        lastModified: archive.lastModified,
        bytes: new Uint8Array(await archive.arrayBuffer()),
      });

      return {
        ok: true as const,
        code: "VALID_ARCHIVE" as const,
        message:
          "Archive validated. Review the included categories before running restore.",
        archive: summary.archive satisfies CmsDataArchiveUploadSummary,
      };
    } catch (error) {
      return {
        ok: false as const,
        code: "INVALID_ARCHIVE_CONTENT" as const,
        message:
          error instanceof Error
            ? error.message
            : "Archive validation failed.",
      };
    }
  });
