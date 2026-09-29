/**
 * Reading the cached branches of the data-submission applications and the
 * cached JGA registrations, which is all the screens that seed a draft read of
 * the application system.
 *
 * **These screens never connect to it.** The refresh copies the approved
 * branches and the registrations (`refresh.server.ts`), so a curator can start
 * a draft while that system is down; what a branch approved since the last
 * fetch costs is waiting for the next one.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { dsBranch, jgadRegistration, upstreamRefresh } from "~/db/schema"
import { likeEscaped } from "~/db/like"

import type { DsBranchDetail, DsBranchRow, JgadRegistration } from "./application-db.server"

/**
 * Whether the branches have ever been fetched here. A deployment that has not
 * is told so on the screens, rather than shown an empty table that reads as
 * "no application was approved".
 */
export async function branchesFetched(db: Executor): Promise<boolean> {
  const rows = await db
    .select({ source: upstreamRefresh.source })
    .from(upstreamRefresh)
    .where(and(eq(upstreamRefresh.source, "ds-branch"), isNotNull(upstreamRefresh.succeededAt)))
  return rows.length > 0
}

/**
 * The branches a keyword names, newest approval first.
 *
 * The keyword is matched against the hum label, the application number, the
 * study title and the name of the investigator — everything the row shows, so
 * that what is searched and what is read back are the same four things. The
 * Japanese name is also matched without the space between family and given
 * name, which is how it is usually typed. An empty keyword returns every
 * branch.
 */
export async function searchBranches(db: Executor, keyword: string): Promise<DsBranchRow[]> {
  const trimmed = keyword.trim()
  const pattern = `%${likeEscaped(trimmed)}%`
  const rows = await db
    .select()
    .from(dsBranch)
    .where(trimmed === ""
      ? undefined
      : sql`(${dsBranch.applicationId} ILIKE ${pattern} ESCAPE '\\'
          OR coalesce(${dsBranch.humLabel}, '') ILIKE ${pattern} ESCAPE '\\'
          OR ${dsBranch.titleJa} ILIKE ${pattern} ESCAPE '\\'
          OR ${dsBranch.titleEn} ILIKE ${pattern} ESCAPE '\\'
          OR ${dsBranch.piNameJa} ILIKE ${pattern} ESCAPE '\\'
          OR replace(${dsBranch.piNameJa}, ' ', '') ILIKE ${pattern} ESCAPE '\\'
          OR ${dsBranch.piNameEn} ILIKE ${pattern} ESCAPE '\\')`)
    .orderBy(sql`${dsBranch.approvedOn} DESC NULLS LAST`, desc(dsBranch.applicationId))
  return rows.map(detailOf)
}

/** One branch, with everything a draft takes from it. */
export async function readBranch(db: Executor, applicationId: string): Promise<DsBranchDetail | null> {
  const [row] = await db.select().from(dsBranch).where(eq(dsBranch.applicationId, applicationId))
  return row === undefined ? null : detailOf(row)
}

/**
 * The branch an accession was registered under, so that an accession typed on
 * its own still has the application's access type and diseases.
 *
 * **Nothing is answered when the registration belongs to more than one approved
 * branch.** Some registrations are referenced by two applications, and the two
 * can disagree about the access type; guessing between them would put a value
 * in the draft that no application states.
 */
export async function branchOfAccession(db: Executor, accession: string): Promise<string | null> {
  const rows = await db
    .select({ applicationId: dsBranch.applicationId })
    .from(dsBranch)
    .where(sql`${dsBranch.accessions} @> ARRAY[${accession}]::text[]`)
    .orderBy(asc(dsBranch.applicationId))
    .limit(2)
  return rows.length === 1 ? rows[0]?.applicationId ?? null : null
}

/** What JGA holds about each of the datasets, where it holds anything. */
export async function readJgadRegistrations(
  db: Executor,
  accessions: readonly string[],
): Promise<JgadRegistration[]> {
  if (accessions.length === 0) return []
  return db
    .select({
      accession: jgadRegistration.accession,
      title: jgadRegistration.title,
      datasetType: jgadRegistration.datasetType,
    })
    .from(jgadRegistration)
    .where(inArray(jgadRegistration.accession, [...accessions]))
    .orderBy(asc(jgadRegistration.accession))
}

function detailOf(row: typeof dsBranch.$inferSelect): DsBranchDetail {
  return {
    applicationId: row.applicationId,
    humLabel: row.humLabel,
    applicationType: row.applicationType,
    approvedOn: row.approvedOn,
    titleJa: row.titleJa,
    titleEn: row.titleEn,
    piNameJa: row.piNameJa,
    piNameEn: row.piNameEn,
    accessions: row.accessions,
    aimsJa: row.aimsJa,
    aimsEn: row.aimsEn,
    methodsJa: row.methodsJa,
    methodsEn: row.methodsEn,
    targetsJa: row.targetsJa,
    targetsEn: row.targetsEn,
    affiliationJa: row.affiliationJa,
    affiliationEn: row.affiliationEn,
    country: row.country,
    dataAccess: row.dataAccess,
    icd10: row.icd10,
  }
}
