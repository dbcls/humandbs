import { drizzle } from "drizzle-orm/bun-sql";

import * as schema from "@/db/schema";

export const db = drizzle(
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`,
  {
    schema,
  }
);
