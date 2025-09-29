import { BunSQLDatabase, drizzle } from "drizzle-orm/bun-sql";

import * as schema from "@/db/schema";

declare module global {
  var db: BunSQLDatabase<typeof schema> | undefined;
}

const DATABASE_URL = `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;

let db: BunSQLDatabase<typeof schema>;

if (Bun.env.NODE_ENV === "production") {
  db = drizzle(DATABASE_URL, {
    schema,
  });
} else {
  if (!global.db) {
    global.db = drizzle(DATABASE_URL, {
      schema,
      // logger: {
      //   logQuery: (query) => {
      //     // to remove quotes on query string, to make it more readable
      //     console.log({ query: query.replace(/\"/g, "") });
      //   },
      // },
    });
  }

  db = global.db;
}

export { db };
