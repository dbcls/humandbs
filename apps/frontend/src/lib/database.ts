// import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

// config();

const DATABASE_URL = `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`;

console.log("process.env.POSTGRES_HOST", process.env.POSTGRES_HOST);
console.log("Bun env", Bun.env.POSTGRES_HOST);
console.log("DATABASE_URL", DATABASE_URL);
const pool = new Pool({
  connectionString: DATABASE_URL,
});
export const db = drizzle(pool, { schema });
