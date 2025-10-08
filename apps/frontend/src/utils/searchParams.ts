import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(5),
});

export const filterStringSchema = z.object({
  filter: z.coerce.string().max(100).default(""),
});
