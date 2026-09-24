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

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { sql } from "drizzle-orm"

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import type { DatasetContent, ResearchContent, VersionContent } from "~/content/types"
import { closePools, getOwnerDb, type Executor } from "~/db/client.server"
import {
  accessionDate,
  alert,
  cauEntry,
  contentKey,
  dataset,
  document,
  documentContent,
  documentSeries,
  event,
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
import { icd10TermIds, importIcd10Terms } from "~/icd10/vocabulary.server"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  buildAccessionDates,
  buildCauRows,
  buildDatasetContent,
  buildResearchContent,
  ownLines,
} from "./build"
import { buildAlerts, buildDocuments, buildNews, loadCms, type SuppliedAlertText } from "./cms"
import {
  ACCESS_CRITERIA_KEY,
  ACCESS_CRITERIA_SET,
  ACCESS_CRITERIA_TERMS,
  contentKeySeeds,
  FACET_CATEGORIES,
  TYPE_OF_DATA_KEY,
} from "./catalog"
import { loadDump, selectPublishedDatasets, versionNumber, type PublishedDataset } from "./es"
import { collectTerms, DISEASE_SET, vocabularySetSeeds } from "./facets"
import { heldIcd10Entries } from "./icd10-input"
import { byHand, type ReadByHand } from "./numbers"
import { loadHumAccessions } from "./upstream"

/**
 * The lines somebody read by hand, if any have been. **Optional on purpose** —
 * a fresh checkout has none, and the rules alone still load the data.
 */
function readByHand(): ReadByHand[] {
  const path = join(import.meta.dirname, "input", "read-by-hand.json")
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, "utf8")) as ReadByHand[]
}

/**
 * The banner translations somebody wrote, for the announcements the old CMS
 * holds in one language. Optional the same way, and `buildAlerts` says which
 * one is missing when a banner that is up has no entry here.
 */
function suppliedAlertText(): SuppliedAlertText[] {
  const path = join(import.meta.dirname, "input", "alert-translations.json")
  if (!existsSync(path)) return []
  return JSON.parse(readFileSync(path, "utf8")) as SuppliedAlertText[]
}

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
 * it. **The one exception is the disease vocabulary**, which is the ICD10
 * classification put in whole from the distributions on disk
 * (`~/icd10/vocabulary.server`); the dump's codes are looked up in it.
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
        hierarchical: s.hierarchical,
      })))
      .returning({ id: vocabularySet.id }),
  )

  // The classification has to be on disk before this runs; the import script
  // leaves it there (`docs/development.md` の「ICD10 の語彙を入れる」). Nothing
  // is written yet, so stopping here leaves the previous data as it was.
  const classification = heldIcd10Entries()
  if (classification === null) {
    throw new Error("the ICD10 distributions are not under migration/input; run `npm run icd10:import` first")
  }
  await importIcd10Terms(tx, classification)
  const icd10Ids = await icd10TermIds(tx)
  const knownCode = (code: string) => icd10Ids.has(code)

  const experiments = datasets.flatMap((d) => d.doc.experiments ?? [])
  const terms = [
    ...ACCESS_CRITERIA_TERMS.map((t) => ({
      setCode: ACCESS_CRITERIA_SET,
      ...t,
      parentCode: null,
      maker: null,
    })),
    ...[...collectTerms(experiments)].flatMap(([setCode, held]) =>
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
    maker: term.maker,
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
  const termIdBySetAndCode = new Map([
    ...rootIds,
    ...childIds,
    ...[...icd10Ids].map(([code, id]): [string, string] => [`${DISEASE_SET}/${code}`, id]),
  ])

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
      })))
      .returning({ id: contentKey.id }),
  )

  return { keyIdByCode, termIdBySetAndCode, codeBySourceKey, knownCode }
}

/**
 * Site content. Each locale that was published gets its row — publication is
 * per locale here, so a Japanese-only document stays Japanese-only rather than
 * gaining an empty English side.
 *
 * The version-less slug of a guideline becomes a series row naming the newest
 * revision, and every revision keeps its own numbered address.
 */
async function loadSiteContent(tx: Executor) {
  const cms = loadCms()

  const { documents, series } = buildDocuments(cms.documents)
  const idBySlug = await insertReturning(
    documents,
    (d) => d.slug,
    (chunk) => tx
      .insert(document)
      .values(chunk.map((d) => ({ slug: d.slug })))
      .returning({ id: document.id }),
  )

  await insertChunked(
    series.map((s) => ({
      slug: s.slug,
      currentId: identityOf(idBySlug, s.currentSlug, "document"),
    })),
    (chunk) => tx.insert(documentSeries).values(chunk),
  )

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

  const alerts = buildAlerts(cms.alerts, suppliedAlertText())
  const alertIds = await insertReturning(
    alerts,
    (_, index) => index,
    (chunk) => tx
      .insert(alert)
      .values(chunk.map((a) => ({ content: a.content, active: a.active })))
      .returning({ id: alert.id }),
  )

  // The editing screen says since when an alert has been up by reading the
  // trail, so one that comes across standing is put up there as well — under
  // the reserved actor, at the instant the input holds for it.
  await insertChunked(
    alerts.flatMap((a, index) => a.shownAt === null
      ? []
      : [{
          occurredAt: a.shownAt,
          actorSub: BOOTSTRAP_ACTOR.sub,
          actorName: BOOTSTRAP_ACTOR.name,
          action: "publish-site-content" as const,
          subjectType: "alert" as const,
          subjectId: identityOf(alertIds, index, "alert"),
        }]),
    (chunk) => tx.insert(event).values(chunk),
  )

  return {
    documents: documents.length,
    series: series.length,
    news: items.length,
    alerts: alerts.length,
  }
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
                     hum_accession, accession_date, upstream_refresh, document, news, alert CASCADE
    `)

    const { keyIdByCode, termIdBySetAndCode, codeBySourceKey, knownCode } = await seedCatalog(
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
    const humOfLabel = new Map(datasets.map((d) => [d.label, d.humId]))
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

    // A v1 cell may be a table about several datasets at once, copied into each
    // of them; these two say which lines of a cell are about somebody else and
    // are already recorded there (`build.ts` の `ownLines`).
    const datasetLabels = new Set(datasets.map((d) => d.label))
    const linesOwned = ownLines(datasets)
    // What no rule could read out of a numeric cell, written out for somebody
    // to work through (`build.ts` の `unread`).
    const unread: { dataset: string, sourceKey: string, line: string }[] = []
    const hand = byHand(readByHand())

    // **Built once, folded into every version that lists it.** The dump gives a
    // dataset one description, and each version that published it carries a
    // copy of that description from here on — so the migration writes the same
    // value into every version, and later corrections part company there.
    const descriptionOfDataset = new Map(datasets.map((d) => [
      identityOf(datasetIdByLabel, d.label, "dataset"),
      buildDatasetContent({
        dataset: d,
        keyIdByCode,
        codeBySourceKey,
        termIdBySetAndCode,
        knownCode,
        accessCriteriaKeyCode: ACCESS_CRITERIA_KEY,
        typeOfDataKeyCode: TYPE_OF_DATA_KEY,
        datasetLabels,
        ownLines: linesOwned,
        unread,
        byHand: hand,
      }) satisfies DatasetContent,
    ]))

    const versions = dump.publishedVersions.filter((v) => researchIdByHum.has(v.humId))
    await insertChunked(
      versions.map((rv) => {
        // Every published version in the dump has one; a version without a date
        // would be a defect in the input rather than something to fill in.
        if (!rv.versionReleaseDate) throw new Error(`${rv.humVersionId} has no release date`)
        const number = versionNumber(rv.version)
        if (number === null) throw new Error(`${rv.humVersionId} has no version number`)
        const { datasetIds, ...body } = buildResearchContent({
          version: rv,
          listingSummary: dump.latestVersion.get(rv.humId) === rv
            ? dump.research.get(rv.humId)?.summaryShort ?? null
            : null,
          datasetIdByLabel,
          humOfLabel,
        }) satisfies ResearchContent
        return {
          researchId: identityOf(researchIdByHum, rv.humId, "research"),
          number,
          content: {
            ...body,
            datasets: datasetIds.flatMap((datasetId) => {
              const content = descriptionOfDataset.get(datasetId)
              return content === undefined ? [] : [{ datasetId, ...content }]
            }),
          } satisfies VersionContent,
          releaseDate: rv.versionReleaseDate,
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

    // The other half of the same cache. It is filled before the search rows are
    // built, because those bake the date the projection resolves out of it.
    const dates = buildAccessionDates(selection.datasets)
    await insertChunked(dates, (chunk) => tx.insert(accessionDate).values(chunk))

    const site = await loadSiteContent(tx)

    const search = await rebuildSearchDocs(tx)

    return {
      research: humIds.length,
      versions: versions.length,
      datasets: datasets.length,
      cau: cauRows.length,
      upstream: upstream.length,
      accessionDates: dates.length,
      unread,
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
console.log("document series    ", counts.series)
console.log("news               ", counts.news)
console.log("alerts             ", counts.alerts)
console.log("search docs        ", counts.search)
// The lines no rule could read out of a numeric cell. Written out rather than
// counted, because what is done with them is reading them one at a time.
if (counts.unread.length > 0) {
  const path = join(import.meta.dirname, "input", "unread-numbers.json")
  writeFileSync(path, `${JSON.stringify(counts.unread, null, 2)}\n`)
  const keys = new Map<string, number>()
  for (const one of counts.unread) keys.set(one.sourceKey, (keys.get(one.sourceKey) ?? 0) + 1)
  console.log("unread number lines", counts.unread.length, Object.fromEntries(keys))
  console.log("                   ", path)
}
if (selection.sharedAcrossResearch.length > 0) {
  console.log("dataset ids listed by more than one research:", selection.sharedAcrossResearch)
}
if (selection.missingDocuments.length > 0) {
  console.log("pinned dataset ids with no document:", selection.missingDocuments)
}

await closePools()
