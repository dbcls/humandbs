import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/database";
import { admin } from "better-auth/plugins";
import { betterAuth } from "better-auth";
import * as schema from "@/db/schema";
import { reactStartCookies } from "better-auth/react-start";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  appName: "@humandbs/frontend",
  plugins: [reactStartCookies(), admin()],
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      prompt: "select_account",
    },
  },
});
