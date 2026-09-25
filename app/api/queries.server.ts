/**
 * Reading a batch of published objects for the JSON API.
 *
 * The single-object endpoints read the same way the public pages do
 * (`app/public/queries.server.ts`); what is here is the batched form the search
 * and the bulk stream need, so that responding for twenty researches — or for
 * all of them — is a fixed number of queries rather than one per row.
 *
 * **The set still comes from `search_doc` and from nowhere else.** Every query
 * below starts there and joins the text on, which is the same rule the pages
 * follow and the reason a draft cannot reach an answer.
 */

import { and, eq, inArray, sql } from "drizzle-orm"

import type { CauUsage } from "~/content/public"
import type { DatasetContent, ResearchContent } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  cauEntry,
  humAccession,
  labelPin,
  researchVersion,
  searchDoc,
} from "~/db/schema"
import { latestOf } from "~/public/versions"

import type { Edge } from "./dblink"

/** A published research, at the version the API responds for. */
export interface ResearchBundle {
  researchId: string
  humLabel: string
  versionNumber: number
  releaseDate: string
  versions: { number: number, releaseDate: string }[]
  content: ResearchContent
}

export interface DatasetBundle {
  datasetId: string
  label: string
  humLabel: string
  datePublished: string | null
  dateModified: string | null
  content: DatasetContent
}

/** Every research identity on the public side, or the ones asked about. */
async function publishedResearchIds(
  db: Executor,
  researchIds: readonly string[] | null,
): Promise<{ researchId: string, humLabel: string }[]> {
  const rows = await db
    .select({ researchId: searchDoc.targetId, humLabel: searchDoc.humLabel })
    .from(searchDoc)
    .where(researchIds === null
      ? eq(searchDoc.targetType, "research")
      : and(eq(searchDoc.targetType, "research"), inArray(searchDoc.targetId, [...researchIds])))
  return rows
}

/**
 * The published researches, each at its latest published version.
 *
 * The version list travels with the object because that is where the research's
 * own dates live: the answer holds no separate "last modified", so the newest
 * entry here is what reports when the research last changed.
 */
export async function researchBundles(
  db: Executor,
  researchIds: readonly string[] | null,
): Promise<ResearchBundle[]> {
  const identities = await publishedResearchIds(db, researchIds)
  if (identities.length === 0) return []
  const ids = identities.map((row) => row.researchId)

  const versions = await db
    .select({
      researchId: searchDoc.researchId,
      number: researchVersion.number,
      releaseDate: researchVersion.releaseDate,
      content: sql<ResearchContent>`${searchDoc.content}`,
    })
    .from(searchDoc)
    .innerJoin(researchVersion, eq(researchVersion.id, searchDoc.targetId))
    .where(and(
      eq(searchDoc.targetType, "research-version"),
      inArray(searchDoc.researchId, ids),
    ))

  const byResearch = new Map<string, typeof versions>()
  for (const version of versions) {
    const held = byResearch.get(version.researchId) ?? []
    held.push(version)
    byResearch.set(version.researchId, held)
  }

  return identities.flatMap((identity) => {
    const held = byResearch.get(identity.researchId) ?? []
    const latest = latestOf(held)
    if (latest === null) return []
    return [{
      researchId: identity.researchId,
      humLabel: identity.humLabel,
      versionNumber: latest.number,
      releaseDate: latest.releaseDate,
      versions: held.map((version) => ({ number: version.number, releaseDate: version.releaseDate })),
      content: latest.content,
    }]
  })
}

export async function datasetBundles(
  db: Executor,
  datasetIds: readonly string[] | null,
): Promise<DatasetBundle[]> {
  const rows = await db
    .select({
      datasetId: searchDoc.targetId,
      label: searchDoc.datasetLabel,
      humLabel: searchDoc.humLabel,
      datePublished: searchDoc.datePublished,
      dateModified: searchDoc.dateModified,
      content: sql<DatasetContent>`${searchDoc.content}`,
    })
    .from(searchDoc)
    .where(datasetIds === null
      ? eq(searchDoc.targetType, "dataset")
      : and(eq(searchDoc.targetType, "dataset"), inArray(searchDoc.targetId, [...datasetIds])))

  return rows.flatMap((row) => row.label === null
    ? []
    : [{ ...row, label: row.label }])
}

/** Dataset labels for the identities a research's content names. */
export async function datasetLabels(
  db: Executor,
  researchIds: readonly string[],
): Promise<Map<string, string>> {
  if (researchIds.length === 0) return new Map()
  const rows = await db
    .select({ datasetId: searchDoc.targetId, label: searchDoc.datasetLabel })
    .from(searchDoc)
    .where(and(
      eq(searchDoc.targetType, "dataset"),
      inArray(searchDoc.researchId, [...researchIds]),
    ))
  return new Map(rows.flatMap((row) => row.label === null ? [] : [[row.datasetId, row.label]]))
}

/**
 * Who has used the controlled-access data, grouped by the label it attaches to.
 *
 * **Ordered the same way the page orders it**, by upstream's project numbering:
 * the two are the same list and a reader following a citation from one to the
 * other should not have to work out that they agree.
 */
export async function cauByHumLabel(
  db: Executor,
  humLabels: readonly string[],
): Promise<Map<string, CauUsage[]>> {
  if (humLabels.length === 0) return new Map()
  const rows = await db
    .select()
    .from(cauEntry)
    .where(inArray(cauEntry.humLabel, [...humLabels]))
    .orderBy(cauEntry.applicationId)

  const byLabel = new Map<string, CauUsage[]>()
  for (const row of rows) {
    const held = byLabel.get(row.humLabel) ?? []
    held.push({
      principalInvestigator: { ja: row.piNameJa, en: row.piNameEn },
      affiliation: { ja: row.affiliationJa, en: row.affiliationEn },
      country: { ja: row.countryJa, en: row.countryEn },
      researchTitle: { ja: row.researchTitleJa, en: row.researchTitleEn },
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      datasetAccessions: row.datasetAccessions,
    })
    byLabel.set(row.humLabel, held)
  }
  return byLabel
}

/**
 * The upstream correspondence, restricted to researches the portal publishes and
 * reported under the label whose address responds.
 *
 * The join runs through the `label_pin` table rather than matching the cached label
 * against `search_doc` directly: upstream types the label by hand and has a
 * history of doing so wrongly, and a label that has since been corrected is kept
 * as a secondary pin precisely so that it still resolves. What comes back out is
 * always the primary label, because that is the one `/{humId}` is served at.
 */
export async function publishedEdges(db: Executor): Promise<Edge[]> {
  const rows = await db
    .select({
      accession: humAccession.accession,
      kind: humAccession.kind,
      humLabel: searchDoc.humLabel,
    })
    .from(humAccession)
    .innerJoin(labelPin, and(
      eq(labelPin.kind, "hum"),
      eq(labelPin.label, humAccession.humLabel),
    ))
    .innerJoin(searchDoc, and(
      eq(searchDoc.targetType, "research"),
      eq(searchDoc.researchId, labelPin.researchId),
    ))

  return rows.map((row) => ({
    accession: row.accession,
    type: row.kind,
    humLabel: row.humLabel,
  }))
}
