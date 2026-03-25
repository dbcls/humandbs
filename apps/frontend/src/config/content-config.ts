import { z } from "zod";

import { enumFromStringArray } from "@/utils/zod";

export const CONTENT_IDS = {
  guidelines: [
    "guidelines",
    "data-sharing-guidelines",
    "security-guidelines-for-dbcenters",
    "security-guidelines-for-submitters",
    "security-guidelines-for-users",
  ],
  others: [
    "home",
    "data-submission",
    "data-use",
    "data-processing",
    "dac",
    "off-premise-server",
    "privacy-policy",
    "publications",
    "supported-browsers",
    "violation",
    "committee-1",
    "faq",
  ],
} as const;

export const contentIdSchema = enumFromStringArray(
  Object.values(CONTENT_IDS).flat(),
);

export type ContentId = z.infer<typeof contentIdSchema>;
