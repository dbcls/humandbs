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

import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { sql } from "drizzle-orm"

import type { DatasetContent, ResearchContent, VersionContent } from "~/content/types"
import { closePools, getOwnerDb } from "~/db/client.server"
import {
  accessionDate,
  cauEntry,
  dataset,
  humAccession,
  labelPin,
  research,
  researchVersion,
} from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import {
  buildAccessionDates,
  buildCauRows,
  buildDatasetContent,
  buildResearchContent,
  ownLines,
} from "./build"
import { ACCESS_CRITERIA_KEY, TYPE_OF_DATA_KEY } from "./catalog"
import { loadDump, selectPublishedDatasets, versionNumber } from "./es"
import {
  identityOf,
  insertChunked,
  insertReturning,
  loadSiteContent,
  readByHand,
  seedCatalog,
} from "./load"
import { byHand } from "./numbers"
import { loadHumAccessions } from "./upstream"

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
      selection.datasets.flatMap((d) => d.doc.experiments ?? []),
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
