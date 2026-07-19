import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { i18n } from "@/config/i18n";
import { RESERVED_SEGMENTS } from "@/config/routing";
import { getNavbarItems } from "@/config/siteNavigation";
import { db } from "@/db/database";

export type ValidationResponse =
  | {
      success: true;
      errors?: never;
    }
  | {
      success: false;
      errors: {
        message?: string;
        errorCode?: string;
        path?: string;
      }[];
    };

export const $validateEntityId = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data }): Promise<ValidationResponse> => {
    const contentId = data;

    const segments = contentId.split("/").filter(Boolean);

    if (segments.some((s) => RESERVED_SEGMENTS.includes(s))) {
      return { success: false, errors: [{ errorCode: "RESERVED_SEGMENTS" }] };
    }

    const reservedPathPrefixes = getNavbarItems(i18n.defaultLocale).map((c) => c.id) as string[];

    if (reservedPathPrefixes.includes(segments[0])) {
      return {
        success: false,
        errors: [{ errorCode: "RESERVED_PATH_PREFIXES" }],
      };
    }

    const existingDocument = await db.query.document.findFirst({
      where: (document, { eq }) => eq(document.contentId, contentId),
    });

    if (existingDocument) {
      return { success: false, errors: [{ errorCode: "EXISTING_DOCUMENT" }] };
    }

    return { success: true };
  });
