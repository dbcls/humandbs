import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(5),
});

export const filterStringSchema = z.object({
  filter: z.coerce.string().max(100).default(""),
});
