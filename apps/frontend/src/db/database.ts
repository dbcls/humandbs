import { createServerOnlyFn } from "@tanstack/react-start";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";

const $$getDatabaseURL = createServerOnlyFn(
  () =>
    `postgres://${process.env.HUMANDBS_POSTGRES_USER}:${process.env.HUMANDBS_POSTGRES_PASSWORD}@${process.env.HUMANDBS_POSTGRES_HOST}:${process.env.HUMANDBS_POSTGRES_PORT}/${process.env.HUMANDBS_POSTGRES_DB}`,
);

export const db = drizzle({
  connection: $$getDatabaseURL(),
  schema,
});

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
