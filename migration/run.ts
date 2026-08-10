/**
 * Loading development data from a v1 dump.
 *
 * This is not the migration that produces the real data. It exists so that
 * screens can be written against something the size and shape of the real
 * corpus, and it is thrown away and run again whenever the schema changes. It
 * takes only what is published — the research that have a published version,
 * those versions, and the datasets those versions list.
 *
 * What it deliberately does not do, because each is a decision rather than a
 * transformation: split the shared experiment blocks per dataset, recover the
 * markup that only survives in `rawHtml`, type the catalog keys as vocabularies
 * and numbers, or seed each dataset's file selection.
 *
 * Everything is inserted in one transaction, so a failure leaves the previous
 * data in place.
 */

import { eq, sql } from "drizzle-orm"

import type { DatasetContent, ResearchContent } from "~/content/types"
import { closePools, getOwnerDb, type Executor } from "~/db/client.server"
import {
  alert,
  cauEntry,
  contentKey,
  contentSnapshot,
  dataset,
  datasetContent,
  document,
  documentContent,
  facetCategory,
  humAccession,
  labelPin,
  news,
  newsContent,
  research,
  researchVersion,
  vocabularySet,
  vocabularyTerm,
} from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import { buildCauRows, buildDatasetContent, buildResearchContent } from "./build"
import { buildAlerts, buildDocuments, buildNews, loadCms } from "./cms"
import {
  ACCESS_CRITERIA_KEY,
  ACCESS_CRITERIA_SET,
  ACCESS_CRITERIA_TERMS,
  contentKeySeeds,
  FACET_CATEGORIES,
  TYPE_OF_DATA_KEY,
} from "./catalog"
import { loadDump, selectPublishedDatasets, versionNumber, type PublishedDataset } from "./es"
import { collectTerms, vocabularySetSeeds } from "./facets"
import { loadHumAccessions } from "./upstream"

const CHUNK = 500

/** A lookup that can only miss if the insert it refers to did not happen. */
function identityOf<Key>(identities: Map<Key, string>, key: Key, what: string): string {
  const id = identities.get(key)
  if (id === undefined) throw new Error(`${what} ${String(key)} has no identity`)
  return id
}

async function insertReturning<Row, Key>(
  rows: Row[],
  keyOf: (row: Row, index: number) => Key,
  insert: (chunk: Row[]) => Promise<{ id: string }[]>,
): Promise<Map<Key, string>> {
  const identities = new Map<Key, string>()
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const returned = await insert(chunk)
    returned.forEach((row, j) => {
      const source = chunk[j]
      if (source === undefined) throw new Error("an insert returned more rows than it was given")
      identities.set(keyOf(source, i + j), row.id)
    })
  }
  return identities
}

async function insertChunked<Row>(
  rows: Row[],
  insert: (chunk: Row[]) => Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK))
  return rows.length
}

/**
 * The catalog, the vocabularies, and every term the dump turns out to use.
 *
 * The terms are minted from the data rather than declared, because what a
 * controlled set ought to hold is a decision and this load is not the place for
 * it. Roots go in before the terms that roll up into them, so that a child has
 * an identity to point at — the only vocabulary with a shape at all is ICD10.
 */
async function seedCatalog(tx: Executor, datasets: PublishedDataset[]) {
  const categories = await insertReturning(
    FACET_CATEGORIES,
    (c) => c.code,
    (chunk) => tx.insert(facetCategory).values(chunk).returning({ id: facetCategory.id }),
  )

  const sets = [
    {
      code: ACCESS_CRITERIA_SET,
      labelJa: "アクセス制限",
      labelEn: "Access criteria",
      external: false,
      hierarchical: false,
    },
    ...vocabularySetSeeds(),
  ]
  const setIdByCode = await insertReturning(
    sets,
    (s) => s.code,
    (chunk) => tx
      .insert(vocabularySet)
      .values(chunk.map((s) => ({
        code: s.code,
        labelJa: s.labelJa,
        labelEn: s.labelEn,
        source: s.external ? ("external" as const) : ("portal" as const),
        hierarchical: s.hierarchical,
      })))
      .returning({ id: vocabularySet.id }),
  )
  const sourceOfSet = new Map(sets.map((s) => [s.code, s.external] as const))

  const searchables = datasets.flatMap((d) =>
    (d.doc.experiments ?? []).flatMap((e) => (e.searchable ? [e.searchable] : [])))
  const terms = [
    ...ACCESS_CRITERIA_TERMS.map((t) => ({ setCode: ACCESS_CRITERIA_SET, ...t, parentCode: null })),
    ...[...collectTerms(searchables)].flatMap(([setCode, held]) =>
      held.map((term) => ({ setCode, ...term }))),
  ]
  const termRow = (
    term: (typeof terms)[number],
    index: number,
    parentId: string | null,
  ) => ({
    setId: identityOf(setIdByCode, term.setCode, "vocabulary set"),
    code: term.code,
    labelJa: term.labelJa,
    labelEn: term.labelEn,
    source: sourceOfSet.get(term.setCode) === true ? ("external" as const) : ("portal" as const),
    position: index,
    parentId,
  })
  const termKey = (term: { setCode: string, code: string }) => `${term.setCode}/${term.code}`

  const rootIds = await insertReturning(
    terms.filter((term) => term.parentCode === null),
    termKey,
    (chunk) => tx
      .insert(vocabularyTerm)
      .values(chunk.map((term, i) => termRow(term, i, null)))
      .returning({ id: vocabularyTerm.id }),
  )
  const childIds = await insertReturning(
    terms.filter((term) => term.parentCode !== null),
    termKey,
    (chunk) => tx
      .insert(vocabularyTerm)
      .values(chunk.map((term, i) => termRow(
        term,
        i,
        rootIds.get(`${term.setCode}/${term.parentCode ?? ""}`) ?? null,
      )))
      .returning({ id: vocabularyTerm.id }),
  )
  const termIdBySetAndCode = new Map([...rootIds, ...childIds])

  const { keys, codeBySourceKey } = contentKeySeeds()
  const keyIdByCode = await insertReturning(
    keys,
    (k) => k.code,
    (chunk) => tx
      .insert(contentKey)
      .values(chunk.map((k) => ({
        code: k.code,
        scope: k.scope,
        valueType: k.valueType,
        labelJa: k.labelJa,
        labelEn: k.labelEn,
        position: k.position,
        vocabularySetId: k.vocabularySetCode === null
          ? null
          : identityOf(setIdByCode, k.vocabularySetCode, "vocabulary set"),
        multiple: k.multiple,
        canonicalUnit: k.canonicalUnit,
        inputUnits: k.inputUnits,
        facetCategoryId: k.facetCategoryCode === null
          ? null
          : identityOf(categories, k.facetCategoryCode, "facet category"),
        showOnPublicPage: k.showOnPublicPage,
      })))
      .returning({ id: contentKey.id }),
  )

  return { keyIdByCode, termIdBySetAndCode, codeBySourceKey }
}

/**
 * Site content. Documents are inserted parents-first so that a past version can
 * point at the one that superseded it, and each locale that was published gets
 * its row — publication is per locale here, so a Japanese-only document stays
 * Japanese-only rather than gaining an empty English side.
 */
async function loadSiteContent(tx: Executor) {
  const cms = loadCms()

  const documents = buildDocuments(cms.documents)
  const idBySlug = await insertReturning(
    documents,
    (d) => d.slug,
    (chunk) => tx
      .insert(document)
      .values(chunk.map((d) => ({ slug: d.slug, position: d.position })))
      .returning({ id: document.id }),
  )

  for (const past of documents) {
    if (past.latestOfSlug === null) continue
    await tx
      .update(document)
      .set({ latestOfId: identityOf(idBySlug, past.latestOfSlug, "document") })
      .where(eq(document.id, identityOf(idBySlug, past.slug, "document")))
  }

  await insertChunked(
    documents.flatMap((d) => d.contents.map((c) => ({
      documentId: identityOf(idBySlug, d.slug, "document"),
      locale: c.locale,
      content: c.content,
      published: true,
      publishedAt: c.publishedAt,
    }))),
    (chunk) => tx.insert(documentContent).values(chunk),
  )

  const items = buildNews(cms.news)
  const newsIds = await insertReturning(
    items,
    (_, index) => index,
    (chunk) => tx
      .insert(news)
      .values(chunk.map((item) => ({ publishedAt: item.publishedAt })))
      .returning({ id: news.id }),
  )

  await insertChunked(
    items.flatMap((item, index) => item.contents.map((c) => ({
      newsId: identityOf(newsIds, index, "news"),
      locale: c.locale,
      content: c.content,
      published: true,
    }))),
    (chunk) => tx.insert(newsContent).values(chunk),
  )

  const alerts = buildAlerts(cms.alerts)
  await insertChunked(alerts, (chunk) => tx.insert(alert).values(chunk))

  return { documents: documents.length, news: items.length, alerts: alerts.length }
}

async function load() {
  const dump = loadDump()
  const selection = selectPublishedDatasets(dump)
  // TRUNCATE belongs to the owner, not to the role that serves requests
  // (`app/db/grants.server.ts`).
  const db = getOwnerDb()

  const counts = await db.transaction(async (tx) => {
    // CASCADE reaches the datasets, versions, snapshots, pins and search rows
    // that hang off these. Administrators and sessions are not part of what this
    // load owns, so reloading the data does not sign anybody out or remove their
    // access.
    await tx.execute(sql`
      TRUNCATE TABLE research, content_key, vocabulary_set, facet_category, cau_entry,
                     hum_accession, document, news, alert CASCADE
    `)

    const { keyIdByCode, termIdBySetAndCode, codeBySourceKey } = await seedCatalog(
      tx,
      selection.datasets,
    )

    const humIds = [...new Set(dump.publishedVersions.map((v) => v.humId))].sort()
    const researchIdByHum = await insertReturning(
      humIds,
      (hum) => hum,
      (chunk) => tx.insert(research).values(chunk.map(() => ({}))).returning({ id: research.id }),
    )

    await insertChunked(humIds, (chunk) => tx.insert(labelPin).values(chunk.map((hum) => ({
      kind: "hum" as const,
      label: hum,
      researchId: identityOf(researchIdByHum, hum, "research"),
      isPrimary: true,
    }))))

    const datasets = selection.datasets.filter((d) => researchIdByHum.has(d.humId))
    const datasetIdByLabel = await insertReturning(
      datasets,
      (d) => d.label,
      (chunk) => tx
        .insert(dataset)
        .values(chunk.map((d) => ({ researchId: identityOf(researchIdByHum, d.humId, "research") })))
        .returning({ id: dataset.id }),
    )

    await insertChunked(datasets, (chunk) => tx.insert(labelPin).values(chunk.map((d) => ({
      kind: "dataset" as const,
      label: d.label,
      datasetId: identityOf(datasetIdByLabel, d.label, "dataset"),
      isPrimary: true,
    }))))

    await insertChunked(datasets, (chunk) => tx.insert(datasetContent).values(chunk.map((d) => ({
      datasetId: identityOf(datasetIdByLabel, d.label, "dataset"),
      content: buildDatasetContent({
        dataset: d,
        keyIdByCode,
        codeBySourceKey,
        termIdBySetAndCode,
        accessCriteriaKeyCode: ACCESS_CRITERIA_KEY,
        typeOfDataKeyCode: TYPE_OF_DATA_KEY,
      }) satisfies DatasetContent,
    }))))

    const versions = dump.publishedVersions.filter((v) => researchIdByHum.has(v.humId))
    const snapshotIds = await insertReturning(
      versions.map((rv) => ({
        researchId: identityOf(researchIdByHum, rv.humId, "research"),
        content: buildResearchContent({
          version: rv,
          summaryShort: dump.latestVersion.get(rv.humId) === rv
            ? dump.research.get(rv.humId)?.summaryShort ?? null
            : null,
          datasetIdByLabel,
        }) satisfies ResearchContent,
      })),
      (_, index) => index,
      (chunk) => tx.insert(contentSnapshot).values(chunk).returning({ id: contentSnapshot.id }),
    )

    await insertChunked(
      versions.map((rv, index) => {
        // Every published version in the dump has one; a version without a date
        // would be a defect in the input rather than something to fill in.
        if (!rv.versionReleaseDate) throw new Error(`${rv.humVersionId} has no release date`)
        const number = versionNumber(rv.version)
        if (number === null) throw new Error(`${rv.humVersionId} has no version number`)
        return {
          researchId: identityOf(researchIdByHum, rv.humId, "research"),
          number,
          snapshotId: identityOf(snapshotIds, index, "snapshot"),
          releaseDate: rv.versionReleaseDate,
          published: true,
        }
      }),
      (chunk) => tx.insert(researchVersion).values(chunk),
    )

    const cauRows = [...dump.research.values()]
      .filter((r) => researchIdByHum.has(r.humId))
      .flatMap((r) => buildCauRows(r.humId, r.controlledAccessUser ?? []))
    await insertChunked(cauRows, (chunk) => tx.insert(cauEntry).values(chunk))

    // The upstream correspondence is a cache of somebody else's table, so it is
    // loaded whole rather than cut down to what this dump happens to hold: the
    // difference between the two is exactly what the publish gate checks for,
    // and what the supply endpoint leaves out.
    const upstream = loadHumAccessions()
    await insertChunked(upstream, (chunk) => tx.insert(humAccession).values(chunk))

    const site = await loadSiteContent(tx)

    const search = await rebuildSearchDocs(tx)

    return {
      research: humIds.length,
      versions: versions.length,
      datasets: datasets.length,
      cau: cauRows.length,
      upstream: upstream.length,
      ...site,
      search,
    }
  })

  return { counts, selection }
}

const { counts, selection } = await load()

console.log("research           ", counts.research)
console.log("published versions ", counts.versions)
console.log("datasets           ", counts.datasets)
console.log("controlled-access  ", counts.cau)
console.log("upstream accessions", counts.upstream)
console.log("documents          ", counts.documents)
console.log("news               ", counts.news)
console.log("alerts             ", counts.alerts)
console.log("search docs        ", counts.search)
if (selection.sharedAcrossResearch.length > 0) {
  console.log("dataset ids listed by more than one research:", selection.sharedAcrossResearch)
}
if (selection.missingDocuments.length > 0) {
  console.log("pinned dataset ids with no document:", selection.missingDocuments)
}

await closePools()
