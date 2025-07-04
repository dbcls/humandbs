import { z } from "zod";
import { enumFromStringArray } from "./utils";

export const CONTENT_IDS = {
  guidelines: [
    "guidelines",
    "data-sharing-guidelines",
    "security-guidelines-for-dbcenters",
    "security-guidelines-for-submitters",
    "security-guidelines-for-users",
  ],
  others: ["about", "home", "front", "data-submission", "data-usage"],
} as const;

export const contentIdSchema = enumFromStringArray(
  Object.values(CONTENT_IDS).flat()
);

export type ContentId = z.infer<typeof contentIdSchema>;
