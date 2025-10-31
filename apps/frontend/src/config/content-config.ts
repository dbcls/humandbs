import { z } from "zod";
import { enumFromStringArray } from "../lib/utils";

export const CONTENT_IDS = {
  guidelines: [
    "guidelines",
    "data-sharing-guidelines",
    "security-guidelines-for-dbcenters",
    "security-guidelines-for-submitters",
    "security-guidelines-for-users",
  ],
  others: [
    "about-data",
    "home",
    "data-submission",
    "data-submission-application",
    "data-usage",
    "achievements",
    "contact",
  ],
} as const;

export const contentIdSchema = enumFromStringArray(
  Object.values(CONTENT_IDS).flat()
);

export type ContentId = z.infer<typeof contentIdSchema>;
