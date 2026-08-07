/**
 * Applies the privileges of the application role. Chained onto `db:push`,
 * because the grants describe tables the push has just created.
 */

import { loadConfig } from "~/config.server"
import { closePools, getOwnerDb } from "~/db/client.server"
import { applyGrants, grantStatements, parseConnection } from "~/db/grants.server"

const config = loadConfig(process.env)
const app = parseConnection(config.databaseUrl)
const owner = parseConnection(config.ownerDatabaseUrl)

await applyGrants(getOwnerDb(), grantStatements(app, owner))
await closePools()

console.log(`granted ${app.user} read and write on ${app.database}, append-only on event`)
