/**
 * Applies the privileges of the application role. Chained onto `db:push`,
 * because the grants describe tables the push has just created; a deployment
 * applies them in `scripts/migrate.ts` instead, and this stays the way to put
 * them back by hand (after a restore, for one).
 */

import { closePools, getOwnerDb } from "~/db/client.server"
import { applyGrantsFromEnv } from "~/db/grants.server"

const app = await applyGrantsFromEnv(getOwnerDb(), process.env)
await closePools()

console.log(`granted ${app.user} read and write on ${app.database}, append-only on event`)
