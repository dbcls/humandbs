/**
 * Writes a version as a daily backup has it into the live database, as a new
 * draft of its research (`app/admin/restore.server.ts`).
 *
 *   npm run restore:version -- <backup database url> <hum label> <version number> <YYYYMMDD>
 *
 * The backup database is a dump restored into a throwaway server, and the date
 * is the one the dump is named by. That database is brought to the schema in
 * `drizzle/` before it is read, so a version written before a later migration
 * reshaped the content is read in the shape the application has now.
 */

import { join } from "node:path"

import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Client } from "pg"

import { backupDraftName } from "~/admin/draft-name"
import { draftFromBackup, readBackupVersion } from "~/admin/restore.server"
import { closePools, getDb } from "~/db/client.server"
import * as schema from "~/db/schema"

const USAGE = "usage: npm run restore:version -- <backup database url> <hum label> <version number> <YYYYMMDD>"

const MIGRATIONS_FOLDER = join(import.meta.dirname, "..", "drizzle")

const [url, label, numberText, day] = process.argv.slice(2)
const number = Number(numberText)
const name = day === undefined ? null : backupDraftName(day)
if (url === undefined || label === undefined || !Number.isInteger(number) || number < 1 || name === null) {
  console.error(USAGE)
  process.exit(1)
}

const client = new Client({ connectionString: url })
await client.connect()
try {
  const backup = drizzle(client, { schema, casing: "snake_case" })
  await migrate(backup, { migrationsFolder: MIGRATIONS_FOLDER })
  const version = await readBackupVersion(backup, label, number)
  if (version === null) {
    console.error(`the backup has no version ${String(number)} of ${label}; nothing was written`)
    process.exitCode = 1
  } else {
    const outcome = await draftFromBackup(getDb(), label, version, name)
    if (outcome.status === "elsewhere") {
      console.error(`${label} is pinned to another research now, or to none; nothing was written`)
      process.exitCode = 1
    } else {
      console.log(`created the draft "${name}": /admin/research/${version.researchId}/draft/${outcome.draftId}`)
    }
  }
} finally {
  await client.end()
  await closePools()
}
