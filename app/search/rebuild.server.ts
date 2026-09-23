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

import { and, eq, inArray, isNotNull } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

import { publicDataset, publicResearchContent, PUBLISHED } from "~/content/public"
import type {
  DatasetContent,
  Slot,
  TranslatedText,
  ValueSlot,
  VersionContent,
} from "~/content/types"
import { descriptionOf, draftContentOf } from "~/content/version"
import type { Executor } from "~/db/client.server"
import {
  accessionDate,
  contentKey,
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

/** The highest-numbered version of each research among the rows given. */
function newestPerResearch<T extends { researchId: string, number: number }>(
  versions: readonly T[],
): T[] {
  const newest = new Map<string, T>()
  for (const version of versions) {
    const held = newest.get(version.researchId)
    if (held === undefined || version.number > held.number) {
      newest.set(version.researchId, version)
    }
  }
  return [...newest.values()]
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
    // A disease holds its own name as text, which the projection already
    // flattens; what is missing without this is the classification's heading.
    if (value.kind === "disease" && value.diseases.state === "value") {
      for (const one of value.diseases.value) for (const id of one.termIds) ids.add(id)
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
  isNumberFacetKey: (keyId: string) => boolean,
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
    // A disease is counted by the terms it points at, so one naming none is in
    // no facet at all. It stays findable through the full text, which holds the
    // name the article wrote (`docs/data-model.md` の「ICD10」).
    if (value.kind === "disease" && value.diseases.state === "value") {
      for (const one of value.diseases.value) {
        for (const termId of one.termIds) {
          terms.set(`${slot.keyId}/${termId}`, {
            keyId: slot.keyId,
            termId,
            ancestorIds: ancestorsOf(termId),
          })
        }
      }
    }
    // **Most number keys hold no row at all.** A key is a source of facet rows
    // only when the catalog has given it a category (`isNumberFacetKey`), which
    // today is `subject-count` and `read-length` — every other number is shown
    // on the dataset page and nowhere else. The canonical unit is what the
    // facet compares; the entered one is not.
    if (value.kind === "number" && value.values.state === "value" && isNumberFacetKey(slot.keyId)) {
      for (const number of value.values.value) {
        numbers.set(`${slot.keyId}/${number.value}`, { keyId: slot.keyId, value: number.value })
        // **A width is two rows, its lower and upper ends.** The table stays
        // one value per row (`search_facet_number` は変わっていない), and a
        // range asked of the key is answered by either end that falls inside
        // it — the same rule that already makes several plain numbers under
        // one key findable by the one that matches.
        const high = number.high ?? null
        if (high !== null) {
          numbers.set(`${slot.keyId}/${high}`, { keyId: slot.keyId, value: high })
        }
      }
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

  const versions = await db
    .select({
      id: researchVersion.id,
      researchId: researchVersion.researchId,
      number: researchVersion.number,
      releaseDate: researchVersion.releaseDate,
      content: researchVersion.content,
    })
    .from(researchVersion)
    .where(within(researchVersion.researchId))

  // **The newest version is what describes a dataset here.** Every version
  // carries the descriptions it published, but a dataset has one row and one
  // address — so the row takes the description a reader arriving without a
  // version number gets. Older versions keep theirs; nothing reads them back
  // out except the version's own page, which lists identities rather than
  // descriptions.
  const datasets = newestPerResearch(versions).flatMap((version) =>
    version.content.datasets.map((row) => ({
      id: row.datasetId,
      researchId: version.researchId,
      content: descriptionOf(row),
    })))

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

  // The number keys that are facets rather than display only
  // (`~/search/catalog.server` の `loadFacetDefinitions`).
  const numberFacetKeyIds = new Set(
    (await db
      .select({ id: contentKey.id })
      .from(contentKey)
      .where(and(eq(contentKey.valueType, "number"), isNotNull(contentKey.facetCategoryId))))
      .map((row) => row.id),
  )
  const isNumberFacetKey = (keyId: string) => numberFacetKeyIds.has(keyId)

  // A research is published when it has a published version; a dataset is on
  // the public side when a published version lists it. Holding published
  // content is not enough — an orphan keeps its content so it can be restored.
  const versionsByResearch = new Map<string, typeof versions>()
  const listedDatasetIds = new Set<string>()
  for (const version of versions) {
    const held = versionsByResearch.get(version.researchId) ?? []
    held.push(version)
    versionsByResearch.set(version.researchId, held)
    for (const row of version.content.datasets) listedDatasetIds.add(row.datasetId)
  }

  // Datasets first: a research row carries the text and the facets of the ones
  // below it. The text is derived from the projection and the facets from the
  // content (`facetValuesOf`), which is why both are kept here.
  interface DatasetProjection {
    id: string
    researchId: string
    label: string
    /**
     * What the version says about it, unprojected. **The published row carries
     * the content rather than the public representation**: what the catalog
     * hides is still content, and the screens asking "is this key still in use"
     * would find nothing if the row had already dropped it.
     */
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
      { files: [], archive: archiveDates.get(label) ?? null },
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
  const datasetLabelsOfVersion = (content: VersionContent): string[] =>
    content.datasets.flatMap((row) => {
      const label = datasetLabelOf.get(row.datasetId)
      return label === undefined ? [] : [label]
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
    const body = draftContentOf(current.content)
    const content = publicResearchContent(body, PUBLISHED)
    const title = titleOf(content.title)
    titleOfResearch.set(row.id, title)
    const dates = held.map((v) => v.releaseDate)
    researchDocKeyOf.set(row.id, docs.length)
    docs.push({
      targetType: "research",
      targetId: row.id,
      researchId: row.id,
      humLabel,
      content: body,
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
      content: draftContentOf(version.content),
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
      content: row.content,
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
    const facets = facetValuesOf(row.content, ancestorsOf, isNumberFacetKey)
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
