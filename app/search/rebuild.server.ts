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
 * A research row carries the text and the facet values of its datasets as well
 * as its own. A dataset belongs to exactly one research, so this duplicates
 * nothing, and it is what makes "find the study whose analysis method mentions
 * this" work in the research list and what lets both listings be filtered by
 * one shape of query. A version row carries only its datasets' labels: versions
 * are the ledger of what is published rather than something the lists search.
 *
 * A full rebuild is a normal operation rather than a repair. The corpus is a
 * few thousand rows, and rebuilding it is how a change to the derivation, to
 * the catalog, or to a vocabulary reaches the search.
 *
 * **A research is also a unit on its own**, and it is the unit a publish uses.
 * Everything a publish can move stays inside one research: a dataset belongs to
 * exactly one, the versions its description reaches are that research's, and so
 * are the labels. Rebuilding everything for one publish would be several
 * seconds of rewriting rows nothing touched. The derivation is the same
 * function either way — the scope only decides which rows are dropped and read
 * back — so the two cannot drift.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import { publicDataset, publicResearchContent, PUBLISHED, type CatalogKey } from "~/content/public"
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

import { concatSearchText, searchTextOf, termsSearchText, type SearchText } from "./text"

export interface RebuildCounts {
  research: number
  researchVersions: number
  datasets: number
  facetTerms: number
  facetNumbers: number
}

const INSERT_CHUNK = 500

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

function heldText(slot: Slot<string>): string {
  return slot.state === "value" ? slot.value : ""
}

/** Both languages of the title in one string; the field is not language-scoped. */
function titleOf(title: TranslatedText): string {
  return [heldText(title.ja), heldText(title.en)].filter(Boolean).join(" ")
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

/** Every vocabulary value a dataset holds, by identity. */
function chosenTerms(content: DatasetContent): string[] {
  const ids = new Set<string>()
  for (const slot of valueSlots(content)) {
    const value = slot.value
    if (value.kind === "vocabulary" && value.termIds.state === "value") {
      for (const id of value.termIds.value) ids.add(id)
    }
  }
  return [...ids]
}

interface TermFacet {
  keyId: string
  termId: string
  ancestorIds: string[]
}

interface NumberFacet {
  keyId: string
  value: number
}

/**
 * The facet values a dataset holds. **They come from the content and not from
 * the projection**: a key the catalog keeps off the public page is exactly what
 * a facet is made of, so projecting first would delete the facets that are
 * meant to exist. Unsettled and not-applicable slots are in neither.
 *
 * Each value appears once. A dataset saying the same thing under the same key
 * in two experiments is one fact about the dataset.
 */
function facetValuesOf(
  content: DatasetContent,
  ancestorsOf: (id: string) => string[],
): { terms: TermFacet[], numbers: NumberFacet[] } {
  const terms = new Map<string, TermFacet>()
  const numbers = new Map<string, NumberFacet>()
  for (const slot of valueSlots(content)) {
    const value = slot.value
    if (value.kind === "vocabulary" && value.termIds.state === "value") {
      for (const termId of value.termIds.value) {
        terms.set(`${slot.keyId}/${termId}`, {
          keyId: slot.keyId,
          termId,
          ancestorIds: ancestorsOf(termId),
        })
      }
    }
    // The canonical unit is what the facet compares; the entered one is not.
    if (value.kind === "number" && value.value.state === "value") {
      const held = value.value.value.value
      numbers.set(`${slot.keyId}/${held}`, { keyId: slot.keyId, value: held })
    }
  }
  return { terms: [...terms.values()], numbers: [...numbers.values()] }
}

const NOTHING: RebuildCounts = {
  research: 0,
  researchVersions: 0,
  datasets: 0,
  facetTerms: 0,
  facetNumbers: 0,
}

/**
 * Which research to derive. Omitted means all of them; a list means those and
 * nothing else, and rows belonging to any other research are left alone.
 */
export interface RebuildScope {
  researchIds: readonly string[]
}

export async function rebuildSearchDocs(
  db: Executor,
  scope?: RebuildScope,
): Promise<RebuildCounts> {
  const researchIds = scope?.researchIds
  if (researchIds?.length === 0) return NOTHING
  const within = (column: AnyPgColumn) =>
    researchIds === undefined ? undefined : inArray(column, [...researchIds])

  // The facet rows reference this one, and both cascade.
  await db.delete(searchDoc).where(within(searchDoc.researchId))

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
    .where(and(eq(researchVersion.published, true), within(researchVersion.researchId)))

  const datasets = await db
    .select({
      id: dataset.id,
      researchId: dataset.researchId,
      content: datasetContent.content,
    })
    .from(datasetContent)
    .innerJoin(dataset, eq(dataset.id, datasetContent.datasetId))
    .where(within(dataset.researchId))

  // The archive owns the dates of an accession it issued; the content carries
  // one only for an id the portal issued itself. Which of the two applies is
  // the projection's decision (`app/content/public.ts`) and its answer is baked
  // into the row here, which is what makes the daily cache refresh reach every
  // listing — the rows are rebuilt in the same transaction.
  const archiveDates = new Map(
    (await db
      .select({
        accession: accessionDate.accession,
        datePublished: accessionDate.datePublished,
        dateModified: accessionDate.dateModified,
      })
      .from(accessionDate))
      .map((row) => [row.accession, { datePublished: row.datePublished, dateModified: row.dateModified }]),
  )

  const terms = await db
    .select({
      id: vocabularyTerm.id,
      parentId: vocabularyTerm.parentId,
      code: vocabularyTerm.code,
      labelJa: vocabularyTerm.labelJa,
      labelEn: vocabularyTerm.labelEn,
    })
    .from(vocabularyTerm)
  const parentOf = new Map(terms.map((t) => [t.id, t.parentId]))
  const termById = new Map(terms.map((t) => [t.id, t]))
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

  // Datasets first: a research row carries the text and the facets of the ones
  // below it. The text is derived from the projection and the facets from the
  // content (`facetValuesOf`), which is why both are kept here.
  interface DatasetProjection {
    id: string
    researchId: string
    label: string
    content: DatasetContent
    /** As the projection resolved them, which is the only place they are decided. */
    dates: { datePublished: string | null, dateModified: string | null }
    text: SearchText
  }
  const projectedDatasets: DatasetProjection[] = []
  const datasetTextByResearch = new Map<string, SearchText[]>()
  for (const row of datasets) {
    if (!listedDatasetIds.has(row.id)) continue
    const humLabel = humLabelOf.get(row.researchId)
    const label = datasetLabelOf.get(row.id)
    if (!humLabel || !label) continue
    const projected = publicDataset(
      row.content,
      { keys, files: [], archive: archiveDates.get(label) ?? null },
      PUBLISHED,
    )
    const text = concatSearchText([
      searchTextOf(projected.content, [humLabel, label]),
      // The labels of what the projection kept. A shown vocabulary value is
      // text on the page, so it has to be text in the index.
      termsSearchText(chosenTerms(projected.content).flatMap((id) => {
        const term = termById.get(id)
        return term === undefined ? [] : [term]
      })),
    ])
    projectedDatasets.push({
      id: row.id,
      researchId: row.researchId,
      label,
      content: row.content,
      dates: projected.dates,
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
  const researchDocKeyOf = new Map<string, number>()
  const titleOfResearch = new Map<string, string>()

  const researchRows = await db.select({ id: research.id }).from(research).where(within(research.id))
  for (const row of researchRows) {
    const held = versionsByResearch.get(row.id)
    const humLabel = humLabelOf.get(row.id)
    if (!held || held.length === 0 || !humLabel) continue
    const current = held.reduce((a, b) => (a.number > b.number ? a : b))
    const content = publicResearchContent(current.content, PUBLISHED)
    const title = titleOf(content.title)
    titleOfResearch.set(row.id, title)
    const dates = held.map((v) => v.releaseDate)
    researchDocKeyOf.set(row.id, docs.length)
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

  // **Labels and nothing else.** A version is the ledger of what was published
  // at a number, not a page either listing searches (`SearchTarget` names the
  // two that are), so flattening its body again would index a copy of the
  // research row for every version and gain nothing to match it with.
  for (const version of versions) {
    const humLabel = humLabelOf.get(version.researchId)
    if (!humLabel) continue
    docs.push({
      targetType: "research-version",
      targetId: version.id,
      researchId: version.researchId,
      humLabel,
      versionNumber: version.number,
      title: titleOfResearch.get(version.researchId) ?? "",
      datePublished: version.releaseDate,
      dateModified: version.releaseDate,
      ...indexed(searchTextOf(null, [
        humLabel,
        `${humLabel}-v${version.number}`,
        ...datasetLabelsOfVersion(version.content),
      ])),
    })
  }

  for (const row of projectedDatasets) {
    const humLabel = humLabelOf.get(row.researchId)
    if (!humLabel) continue
    datasetDocKeyOf.set(row.id, docs.length)
    docs.push({
      targetType: "dataset",
      targetId: row.id,
      researchId: row.researchId,
      humLabel,
      datasetLabel: row.label,
      title: titleOfResearch.get(row.researchId) ?? "",
      datePublished: row.dates.datePublished,
      dateModified: row.dates.dateModified,
      ...indexed(row.text),
    })
  }

  // Identities are needed to attach the facet rows. They come back keyed by the
  // target the row is for rather than by position: `RETURNING` says nothing
  // about the order it answers in, and a facet hung on the wrong document is a
  // wrong answer nothing would raise.
  const idOfTarget = new Map<string, string>()
  for (let i = 0; i < docs.length; i += INSERT_CHUNK) {
    const returned = await db
      .insert(searchDoc)
      .values(docs.slice(i, i + INSERT_CHUNK))
      .returning({ id: searchDoc.id, targetType: searchDoc.targetType, targetId: searchDoc.targetId })
    for (const row of returned) idOfTarget.set(`${row.targetType}/${row.targetId}`, row.id)
  }

  // A research carries the facet values of the datasets below it, so that both
  // listings are filtered and counted by one shape of query. It is a union
  // rather than a copy: asking a research for two facets asks whether anything
  // below it has each, not whether one dataset has both.
  const termRows: (typeof searchFacetTerm.$inferInsert)[] = []
  const numberRows: (typeof searchFacetNumber.$inferInsert)[] = []
  const researchTerms = new Map<string, Map<string, TermFacet>>()
  const researchNumbers = new Map<string, Map<string, NumberFacet>>()

  for (const row of projectedDatasets) {
    const facets = facetValuesOf(row.content, ancestorsOf)
    const docId = idOfTarget.get(`dataset/${row.id}`)
    if (docId !== undefined) {
      for (const term of facets.terms) termRows.push({ docId, ...term })
      for (const number of facets.numbers) numberRows.push({ docId, ...number })
    }
    const terms = researchTerms.get(row.researchId) ?? new Map<string, TermFacet>()
    for (const term of facets.terms) terms.set(`${term.keyId}/${term.termId}`, term)
    researchTerms.set(row.researchId, terms)
    const numbers = researchNumbers.get(row.researchId) ?? new Map<string, NumberFacet>()
    for (const number of facets.numbers) numbers.set(`${number.keyId}/${number.value}`, number)
    researchNumbers.set(row.researchId, numbers)
  }

  for (const [researchId, terms] of researchTerms) {
    const docId = idOfTarget.get(`research/${researchId}`)
    if (docId === undefined) continue
    for (const term of terms.values()) termRows.push({ docId, ...term })
    for (const number of researchNumbers.get(researchId)?.values() ?? []) {
      numberRows.push({ docId, ...number })
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
