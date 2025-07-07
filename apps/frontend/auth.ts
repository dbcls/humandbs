import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./database.ts";
import { admin } from "better-auth/plugins";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    appName: "@humandbs/frontend",
    plugins: [admin()],
});
