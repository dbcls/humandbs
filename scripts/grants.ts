/**
 * Applies the privileges of the application role by hand. Every migrate run
 * applies them already (`scripts/migrate.ts`); this is for putting them back
 * on their own, after a restore for one.
 */

import { closePools, getOwnerDb } from "~/db/client.server"
import { applyGrantsFromEnv } from "~/db/grants.server"

const app = await applyGrantsFromEnv(getOwnerDb(), process.env)
await closePools()

console.log(`granted ${app.user} read and write on ${app.database}, append-only on event`)
