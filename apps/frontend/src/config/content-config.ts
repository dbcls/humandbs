import { z } from "zod";

// Each segment: lowercase alphanumeric and hyphens; segments joined by "/"
export const contentIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/,
    "Content ID must be lowercase alphanumeric segments separated by /",
  );

export type ContentId = z.infer<typeof contentIdSchema>;
