/**
 * Rebuilding the rows the public side reads.
 *
 * **These rows are the definition of what is published.** The public pages, the
 * JSON API and the public search take their set of objects from `search_doc`
 * and from nowhere else, so a withdrawal, a deletion, and a dataset no version
 * points at any more all disappear by the same route: the published set is
 * derived again and they are not in it.
 *
 * The text is derived from the **public projection** rather than from the
 * content, so a value the catalog hides and a value nobody has settled cannot
 * be found by searching for it.
 *
 * A research row carries the text of its datasets as well as its own. A dataset
 * belongs to exactly one research, so this duplicates nothing, and it is what
 * makes "find the study whose analysis method mentions this" work in the
 * research list. A version row carries only its datasets' labels: versions are
 * the ledger of what is published rather than something the lists search.
 *
 * A full rebuild is a normal operation rather than a repair. The corpus is a
 * few thousand rows, and rebuilding it is how a change to the derivation, to
 * the catalog, or to a vocabulary reaches the search.
 */

import { eq } from "drizzle-orm"

import { publicDatasetContent, publicResearchContent, type CatalogKey } from "~/content/public"
import type { DatasetContent, ResearchContent, Slot, TranslatedText, ValueSlot } from "~/content/types"
import type { Executor } from "~/db/client.server"
import {
  accessionDate,
  contentKey,
  contentSnapshot,
  dataset,
  datasetContent,
  labelPin,
  research,
  researchVersion,
  searchDoc,
  searchFacetNumber,
  searchFacetTerm,
  vocabularyTerm,
} from "~/db/schema"

import { concatSearchText, searchTextOf, type SearchText } from "./text"

export interface RebuildCounts {
  research: number
  researchVersions: number
  datasets: number
  facetTerms: number
  facetNumbers: number
}

const INSERT_CHUNK = 500

/** Nothing on the public side is ever derived with unsettled values kept. */
const PUBLISHED = { keepUnsettled: false }

async function insertAll<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<number> {
  // An insert with no values is a syntax error rather than a no-op.
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await insert(rows.slice(i, i + INSERT_CHUNK))
  }
  return rows.length
}

/** The pure side names the languages; the table names the columns. */
function indexed(text: SearchText) {
  return { textJa: text.ja, textEn: text.en }
}

/** Both languages of the title in one string; the field is not language-scoped. */
function titleOf(slot: Slot<TranslatedText>): string {
  if (slot.state !== "value") return ""
  return [slot.value.ja, slot.value.en].filter(Boolean).join(" ")
}

function earliest(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((a, b) => (a < b ? a : b))
}

function latest(dates: string[]): string | null {
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b))
}

/** Every value slot a dataset carries, its own and its experiments'. */
function valueSlots(content: DatasetContent): ValueSlot[] {
  return [...content.values, ...content.experiments.flatMap((e) => e.values)]
}

export async function rebuildSearchDocs(db: Executor): Promise<RebuildCounts> {
  // The facet rows reference this one, and both cascade.
  await db.delete(searchDoc)

  const pins = await db
    .select({
      kind: labelPin.kind,
      label: labelPin.label,
      researchId: labelPin.researchId,
      datasetId: labelPin.datasetId,
      isPrimary: labelPin.isPrimary,
    })
    .from(labelPin)
  const humLabelOf = new Map<string, string>()
  const datasetLabelOf = new Map<string, string>()
  for (const pin of pins) {
    if (!pin.isPrimary) continue
    if (pin.kind === "hum" && pin.researchId) humLabelOf.set(pin.researchId, pin.label)
    if (pin.kind === "dataset" && pin.datasetId) datasetLabelOf.set(pin.datasetId, pin.label)
  }

  // The projection needs to know which keys may be shown; nothing else about
  // the catalog matters here.
  const keyRows = await db
    .select({ id: contentKey.id, showOnPublicPage: contentKey.showOnPublicPage })
    .from(contentKey)
  const keys = new Map<string, CatalogKey>(keyRows.map((key) => [key.id, key]))

  const versions = await db
    .select({
      id: researchVersion.id,
      researchId: researchVersion.researchId,
      number: researchVersion.number,
      releaseDate: researchVersion.releaseDate,
      content: contentSnapshot.content,
    })
    .from(researchVersion)
    .innerJoin(contentSnapshot, eq(contentSnapshot.id, researchVersion.snapshotId))
    .where(eq(researchVersion.published, true))

  const datasets = await db
    .select({
      id: dataset.id,
      researchId: dataset.researchId,
      content: datasetContent.content,
    })
    .from(datasetContent)
    .innerJoin(dataset, eq(dataset.id, datasetContent.datasetId))

  // The archive owns the dates of an accession it issued; the content carries
  // one only for an id the portal issued itself. Resolving it here is what
  // makes the daily cache refresh reach the listings — the rows are rebuilt in
  // the same transaction — and leaves one place that knows which of the two
  // applies.
  const archiveDates = new Map(
    (await db
      .select({
        accession: accessionDate.accession,
        datePublished: accessionDate.datePublished,
        dateModified: accessionDate.dateModified,
      })
      .from(accessionDate))
      .map((row) => [row.accession, row]),
  )

  const terms = await db
    .select({ id: vocabularyTerm.id, parentId: vocabularyTerm.parentId })
    .from(vocabularyTerm)
  const parentOf = new Map(terms.map((t) => [t.id, t.parentId]))
  const ancestorsOf = (id: string): string[] => {
    const chain: string[] = []
    for (let at = parentOf.get(id); at; at = parentOf.get(at)) {
      if (chain.includes(at)) break
      chain.push(at)
    }
    return chain
  }

  // A research is published when it has a published version; a dataset is on
  // the public side when a published version lists it. Holding published
  // content is not enough — an orphan keeps its content so it can be restored.
  const versionsByResearch = new Map<string, typeof versions>()
  const listedDatasetIds = new Set<string>()
  for (const version of versions) {
    const held = versionsByResearch.get(version.researchId) ?? []
    held.push(version)
    versionsByResearch.set(version.researchId, held)
    for (const id of (version.content).datasetIds) listedDatasetIds.add(id)
  }

  // Datasets first: a research row carries the text of the ones below it.
  //
  // The text comes from the projection and the facets come from the content,
  // and the difference is deliberate. A key the catalog keeps off the public
  // page is exactly what a facet is made of, so projecting before collecting
  // them would delete the facets that are meant to exist. Unsettled slots are
  // left out of both.
  interface DatasetProjection {
    id: string
    researchId: string
    label: string
    content: DatasetContent
    projected: DatasetContent
    text: SearchText
  }
  const projectedDatasets: DatasetProjection[] = []
  const datasetTextByResearch = new Map<string, SearchText[]>()
  for (const row of datasets) {
    if (!listedDatasetIds.has(row.id)) continue
    const humLabel = humLabelOf.get(row.researchId)
    const label = datasetLabelOf.get(row.id)
    if (!humLabel || !label) continue
    const projected = publicDatasetContent(row.content, { keys, files: [] }, PUBLISHED)
    const text = searchTextOf(projected, [humLabel, label])
    projectedDatasets.push({
      id: row.id,
      researchId: row.researchId,
      label,
      content: row.content,
      projected,
      text,
    })
    const held = datasetTextByResearch.get(row.researchId) ?? []
    held.push(text)
    datasetTextByResearch.set(row.researchId, held)
  }
  const datasetLabelsOfVersion = (content: ResearchContent): string[] =>
    content.datasetIds.flatMap((id) => {
      const label = datasetLabelOf.get(id)
      return label !== undefined && listedDatasetIds.has(id) ? [label] : []
    })

  type DocRow = typeof searchDoc.$inferInsert
  const docs: DocRow[] = []
  const datasetDocKeyOf = new Map<string, number>()
  const titleOfResearch = new Map<string, string>()

  const researchRows = await db.select({ id: research.id }).from(research)
  for (const row of researchRows) {
    const held = versionsByResearch.get(row.id)
    const humLabel = humLabelOf.get(row.id)
    if (!held || held.length === 0 || !humLabel) continue
    const current = held.reduce((a, b) => (a.number > b.number ? a : b))
    const content = publicResearchContent(current.content, PUBLISHED)
    const title = titleOf(content.title)
    titleOfResearch.set(row.id, title)
    const dates = held.map((v) => v.releaseDate)
    docs.push({
      targetType: "research",
      targetId: row.id,
      researchId: row.id,
      humLabel,
      title,
      datePublished: earliest(dates),
      dateModified: latest(dates),
      ...indexed(concatSearchText([
        searchTextOf(content, [humLabel]),
        ...(datasetTextByResearch.get(row.id) ?? []),
      ])),
    })
  }

  for (const version of versions) {
    const humLabel = humLabelOf.get(version.researchId)
    if (!humLabel) continue
    const content = publicResearchContent(version.content, PUBLISHED)
    docs.push({
      targetType: "research-version",
      targetId: version.id,
      researchId: version.researchId,
      humLabel,
      versionNumber: version.number,
      title: titleOf(content.title),
      datePublished: version.releaseDate,
      dateModified: version.releaseDate,
      ...indexed(searchTextOf(content, [
        humLabel,
        `${humLabel}-v${version.number}`,
        ...datasetLabelsOfVersion(version.content),
      ])),
    })
  }

  for (const row of projectedDatasets) {
    const humLabel = humLabelOf.get(row.researchId)
    if (!humLabel) continue
    const archive = archiveDates.get(row.label)
    datasetDocKeyOf.set(row.id, docs.length)
    docs.push({
      targetType: "dataset",
      targetId: row.id,
      researchId: row.researchId,
      humLabel,
      datasetLabel: row.label,
      title: titleOfResearch.get(row.researchId) ?? "",
      datePublished: row.content.releaseDate ?? archive?.datePublished ?? null,
      dateModified: archive?.dateModified ?? null,
      ...indexed(row.text),
    })
  }

  // Identities are needed to attach the facet rows, so the insert returns them
  // in the order the rows were given.
  const ids: string[] = []
  for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
    const returned = await db
      .insert(searchDoc)
      .values(docs.slice(i, i + INSERT_CHUNK))
      .returning({ id: searchDoc.id })
    ids.push(...returned.map((r) => r.id))
  }

  const termRows: (typeof searchFacetTerm.$inferInsert)[] = []
  const numberRows: (typeof searchFacetNumber.$inferInsert)[] = []
  for (const row of projectedDatasets) {
    const at = datasetDocKeyOf.get(row.id)
    if (at === undefined) continue
    const docId = ids[at]
    if (docId === undefined) continue
    const seen = new Set<string>()
    for (const slot of valueSlots(row.content)) {
      if (slot.slot.state !== "value") continue
      const value = slot.slot.value
      if (value.kind === "vocabulary") {
        for (const termId of value.termIds) {
          const key = `${slot.keyId}/${termId}`
          if (seen.has(key)) continue
          seen.add(key)
          termRows.push({ docId, keyId: slot.keyId, termId, ancestorIds: ancestorsOf(termId) })
        }
      }
      if (value.kind === "number") {
        numberRows.push({ docId, keyId: slot.keyId, value: value.value })
      }
    }
  }

  const facetTerms = await insertAll(termRows, (chunk) => db.insert(searchFacetTerm).values(chunk))
  const facetNumbers = await insertAll(numberRows, (chunk) => db.insert(searchFacetNumber).values(chunk))

  return {
    research: docs.filter((d) => d.targetType === "research").length,
    researchVersions: docs.filter((d) => d.targetType === "research-version").length,
    datasets: docs.filter((d) => d.targetType === "dataset").length,
    facetTerms,
    facetNumbers,
  }
}
