import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { hasPermission } from "@/config/permissions";
import { $$createCmsDataTransferArchive } from "@/lib/cmsDataTransferArchive";
import {
  cmsDataTransferCategorySchema,
  CMS_DATA_TRANSFER_CATEGORIES,
} from "@/serverFunctions/cmsDataTransfer";
import { $getAuthUser } from "@/serverFunctions/authUser";

const searchSchema = z.object({
  category: z
    .union([
      cmsDataTransferCategorySchema,
      z.array(cmsDataTransferCategorySchema),
    ])
    .transform((value) => (Array.isArray(value) ? value : [value])),
});

export const Route = createFileRoute("/admin/data-transfer-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { user } = await $getAuthUser();

        if (!user) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (!hasPermission(user, "admin-panel", "view-cms")) {
          return new Response("Forbidden", { status: 403 });
        }

        const url = new URL(request.url);
        const rawCategories = url.searchParams.getAll("category");
        const parsed = searchSchema.safeParse({ category: rawCategories });

        if (!parsed.success || parsed.data.category.length === 0) {
          return new Response("At least one valid category is required.", {
            status: 400,
          });
        }

        const categories = CMS_DATA_TRANSFER_CATEGORIES.filter((category) =>
          parsed.data.category.includes(category),
        );

        const { bytes } = await $$createCmsDataTransferArchive({
          categories,
          createdBy: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
        });

        const timestamp = new Date()
          .toISOString()
          .replaceAll(":", "-")
          .replace(/\.\d{3}Z$/, "Z");

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "application/gzip",
            "Content-Disposition": `attachment; filename=\"cms-data-export-${timestamp}.tar.gz\"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
