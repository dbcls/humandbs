/**
 * Whether `app/db/schema/` says something `drizzle/` does not yet.
 *
 * A schema edit reaches a database only as a migration, so an edit that was
 * never generated is one no database will ever get — and the tests, which run
 * against a database built from `drizzle/`, would keep passing without it.
 * The check generates into a copy of the folder and looks for a new file; the
 * real folder is never written.
 *
 * **drizzle-kit exits 0 when it fails**, so its silence proves nothing: the
 * check accepts only an answer it can read — a new file, or the sentence
 * drizzle-kit prints when there is nothing to generate.
 */

import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const MIGRATIONS = join(ROOT, "drizzle")
/** drizzle-kit reads `--out` relative to the working directory whatever it is given, so the copy lives inside the repository. */
const SCRATCH = join(ROOT, "node_modules", ".cache")
const NOTHING_TO_GENERATE = "No schema changes"

/** The SQL files a generate would add, or none when the migrations already say it all. */
export function ungeneratedMigrations(): string[] {
  mkdirSync(SCRATCH, { recursive: true })
  const copy = mkdtempSync(join(SCRATCH, "schema-drift-"))
  try {
    cpSync(MIGRATIONS, copy, { recursive: true })
    const before = new Set(readdirSync(copy))
    // The flags stand in for drizzle.config.ts, which would also need a database
    // URL that generating does not use.
    const said = execFileSync(join(ROOT, "node_modules", ".bin", "drizzle-kit"), [
      "generate",
      "--dialect", "postgresql",
      "--casing", "snake_case",
      "--schema", "app/db/schema/index.ts",
      "--out", relative(ROOT, copy),
    ], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    const added = readdirSync(copy).filter((name) => name.endsWith(".sql") && !before.has(name))
    if (added.length === 0 && !said.includes(NOTHING_TO_GENERATE)) {
      throw new Error(`drizzle-kit generate gave no answer that can be read:\n${said}`)
    }
    return added
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
}

if (process.argv[1] === import.meta.filename) {
  const added = ungeneratedMigrations()
  if (added.length > 0) {
    console.error("app/db/schema/ has changes drizzle/ does not: run `npm run db:generate` and commit the migration")
    process.exit(1)
  }
  console.log("drizzle/ matches app/db/schema/")
}
