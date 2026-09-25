/**
 * Every `common/` file the stored bodies link to.
 *
 * The tables are named through the schema rather than written into the query,
 * so a body table that is renamed or removed stops the typecheck instead of the
 * query. `search_doc` is not read: it is built from these.
 */

import { sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { alert, documentContent, draftDatasetEntry, newsContent, researchDraft, researchVersion } from "~/db/schema"

import { commonFileNames } from "./common-references"
import { COMMON_PREFIX_NAME } from "./prefix"

const BODIES = [documentContent, newsContent, alert, researchVersion, researchDraft, draftDatasetEntry] as const

export async function referencedCommonFiles(db: Executor): Promise<string[]> {
  const written = `%/files/${COMMON_PREFIX_NAME}/%`
  const reads = BODIES.map((table) => sql`
    SELECT ${table.content}::text AS body FROM ${table} WHERE ${table.content}::text LIKE ${written}
  `)
  const { rows } = await db.execute<{ body: string }>(sql.join(reads, sql` UNION ALL `))
  return [...new Set(rows.flatMap((row) => commonFileNames(row.body)))].sort()
}
