import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { ContentValue } from "~/content/types"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { rebuildSearchDocs } from "./rebuild.server"

/**
 * These run against the development database, so they need `docker compose up`.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

async function createResearch(humLabel: string): Promise<string> {
  const { id } = only(await db.insert(s.research).values({}).returning({ id: s.research.id }))
  await db.insert(s.labelPin).values({ kind: "hum", label: humLabel, researchId: id, isPrimary: true })
  return id
}

async function createDataset(researchId: string, label: string): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  await db.insert(s.datasetContent).values({ datasetId: id, content: emptyDatasetContent() })
  return id
}

async function publish(
  researchId: string,
  number: number,
  datasetIds: string[],
  releaseDate = "2020-01-01",
): Promise<string> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({ researchId, content: { ...emptyResearchContent(), datasetIds } })
    .returning({ id: s.contentSnapshot.id }))
  const { id } = only(await db.insert(s.researchVersion)
    .values({ researchId, number, snapshotId, releaseDate })
    .returning({ id: s.researchVersion.id }))
  return id
}

async function docs() {
  return db.select({
    targetType: s.searchDoc.targetType,
    targetId: s.searchDoc.targetId,
    humLabel: s.searchDoc.humLabel,
    versionNumber: s.searchDoc.versionNumber,
    datasetLabel: s.searchDoc.datasetLabel,
    datePublished: s.searchDoc.datePublished,
    dateModified: s.searchDoc.dateModified,
  }).from(s.searchDoc)
}

describe("rebuildSearchDocs", () => {
  it("lists a research, each published version, and the datasets they list", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])

    const counts = await rebuildSearchDocs(db)

    expect(counts).toMatchObject({ research: 1, researchVersions: 1, datasets: 1 })
    expect(await docs()).toHaveLength(3)
  })

  it("dates a research from its earliest and latest published version", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "2015-03-01")
    await publish(researchId, 2, [], "2021-09-30")

    await rebuildSearchDocs(db)

    const row = only((await docs()).filter((d) => d.targetType === "research"))
    expect(row.datePublished).toBe("2015-03-01")
    expect(row.dateModified).toBe("2021-09-30")
  })

  it("stops listing a version that has been withdrawn", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    const withdrawn = await publish(researchId, 2, [])
    await db.update(s.researchVersion).set({ published: false }).where(eq(s.researchVersion.id, withdrawn))

    await rebuildSearchDocs(db)

    const versions = (await docs()).filter((d) => d.targetType === "research-version")
    expect(versions.map((v) => v.versionNumber)).toEqual([1])
  })

  it("leaves a research with nothing published out entirely", async () => {
    await createResearch("hum0001")

    await rebuildSearchDocs(db)

    expect(await docs()).toEqual([])
  })

  it("stops listing an orphaned dataset but keeps its content", async () => {
    const researchId = await createResearch("hum0001")
    await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [])

    await rebuildSearchDocs(db)

    expect((await docs()).filter((d) => d.targetType === "dataset")).toEqual([])
    expect(await db.select().from(s.datasetContent)).toHaveLength(1)
  })

  it("carries the ancestors of a term so a broad code matches a narrow one", async () => {
    const researchId = await createResearch("hum0001")
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const { id: parentId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "E11", labelEn: "E11" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: childId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "E11.9", labelEn: "E11.9", parentId })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "disease", scope: "experiment", valueType: "vocabulary", labelJa: "疾患", labelEn: "Disease", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))

    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: filled("WES"),
          values: [{ keyId, value: { kind: "vocabulary", termIds: filled([childId]) } }],
        }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])

    const counts = await rebuildSearchDocs(db)

    // One for the dataset and one for the research above it: both listings are
    // filtered by the same shape of query, so both carry the value.
    expect(counts.facetTerms).toBe(2)
    const facets = await db
      .select({ targetType: s.searchDoc.targetType, termId: s.searchFacetTerm.termId, ancestorIds: s.searchFacetTerm.ancestorIds })
      .from(s.searchFacetTerm)
      .innerJoin(s.searchDoc, eq(s.searchDoc.id, s.searchFacetTerm.docId))
    expect(facets.map((row) => row.targetType).sort()).toEqual(["dataset", "research"])
    for (const facet of facets) {
      expect(facet.termId).toBe(childId)
      expect(facet.ancestorIds).toEqual([parentId])
    }
  })

  it("indexes the code and both labels of a value the catalog shows", async () => {
    const researchId = await createResearch("hum0001")
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const { id: termId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "C349", labelEn: "Bronchus or lung", labelJa: "気管支又は肺" })
      .returning({ id: s.vocabularyTerm.id }))
    const shown = only(await db.insert(s.contentKey)
      .values({ code: "disease-icd10", scope: "experiment", valueType: "vocabulary", labelJa: "疾患", labelEn: "Disease", vocabularySetId: setId, showOnPublicPage: true })
      .returning({ id: s.contentKey.id }))
    const hidden = only(await db.insert(s.contentKey)
      .values({ code: "tissue", scope: "experiment", valueType: "vocabulary", labelJa: "組織", labelEn: "Tissue", vocabularySetId: setId })
      .returning({ id: s.contentKey.id }))

    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: filled("WES"),
          values: [
            { keyId: shown.id, value: { kind: "vocabulary", termIds: filled([termId]) } },
            { keyId: hidden.id, value: { kind: "vocabulary", termIds: filled([termId]) } },
          ],
        }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])

    await rebuildSearchDocs(db)

    // The projection carries the identity of a term and the page resolves the
    // label, so the words a reader sees have to be put back here — otherwise a
    // value shown on the page cannot be found from the search box.
    const [row] = await db
      .select({ ja: s.searchDoc.textJa, en: s.searchDoc.textEn })
      .from(s.searchDoc)
      .where(eq(s.searchDoc.targetType, "dataset"))
    expect(row?.en).toContain("Bronchus or lung")
    expect(row?.ja).toContain("気管支又は肺")
    // The code belongs to both, because it is a word of neither language and is
    // what an ICD10 value is looked up by.
    expect(row?.ja).toContain("C349")
    expect(row?.en).toContain("C349")
    // One shown key and one hidden one carry the same value: it is indexed
    // once, by way of the projection rather than of the content.
    expect(row?.en.split("Bronchus or lung").length).toBe(2)
  })

  it("carries the facet values of a dataset into the row of the research it belongs to", async () => {
    const researchId = await createResearch("hum0001")
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "assay", labelJa: "手法", labelEn: "Assay" })
      .returning({ id: s.vocabularySet.id }))
    const { id: wgs } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "wgs", labelEn: "WGS" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: rna } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "rna-seq", labelEn: "RNA-seq" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: setId, multiple: true })
      .returning({ id: s.contentKey.id }))

    const withValue = async (label: string, termIds: string[]) => {
      const datasetId = await createDataset(researchId, label)
      await db.update(s.datasetContent).set({
        content: {
          ...emptyDatasetContent(),
          experiments: [{
            id: "experiment-1",
            label: filled(label),
            values: [{ keyId, value: { kind: "vocabulary", termIds: filled(termIds) } }],
          }],
        },
      }).where(eq(s.datasetContent.datasetId, datasetId))
      return datasetId
    }
    // The same term twice below one research is one fact about the research.
    const first = await withValue("JGAD000001", [wgs])
    const second = await withValue("JGAD000002", [wgs, rna])
    await publish(researchId, 1, [first, second])

    await rebuildSearchDocs(db)

    const rows = await db
      .select({ targetType: s.searchDoc.targetType, termId: s.searchFacetTerm.termId })
      .from(s.searchFacetTerm)
      .innerJoin(s.searchDoc, eq(s.searchDoc.id, s.searchFacetTerm.docId))
    const research = rows.filter((row) => row.targetType === "research")
    expect(research.map((row) => row.termId).sort()).toEqual([wgs, rna].sort())
  })

  it("carries the text of a dataset into the row of the research it belongs to", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{ id: "experiment-1", label: filled("ATAC-seq"), values: [] }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])

    await rebuildSearchDocs(db)

    const texts = await db
      .select({ targetType: s.searchDoc.targetType, textJa: s.searchDoc.textJa })
      .from(s.searchDoc)
    expect(only(texts.filter((row) => row.targetType === "research")).textJa).toContain("ATAC-seq")
    // A version is the ledger of what was published, not something the lists search.
    const version = only(texts.filter((row) => row.targetType === "research-version"))
    expect(version.textJa).not.toContain("ATAC-seq")
    expect(version.textJa).toContain("JGAD000001")
  })

  it("leaves a value the catalog hides out of the text while still counting it as a facet", async () => {
    const researchId = await createResearch("hum0001")
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "tissue", labelJa: "組織", labelEn: "Tissue" })
      .returning({ id: s.vocabularySet.id }))
    const { id: termId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "liver", labelEn: "Liver" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: hiddenTerms } = only(await db.insert(s.contentKey)
      .values({ code: "tissue", scope: "experiment", valueType: "vocabulary", labelJa: "組織", labelEn: "Tissue", vocabularySetId: setId, showOnPublicPage: false })
      .returning({ id: s.contentKey.id }))
    const { id: hiddenProse } = only(await db.insert(s.contentKey)
      .values({ code: "internal-note", scope: "experiment", valueType: "text", labelJa: "メモ", labelEn: "Note", showOnPublicPage: false })
      .returning({ id: s.contentKey.id }))

    const datasetId = await createDataset(researchId, "JGAD000001")
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: filled("WES"),
          values: [
            { keyId: hiddenTerms, value: { kind: "vocabulary", termIds: filled([termId]) } },
            {
              keyId: hiddenProse,
              value: {
                kind: "text",
                text: { ja: filled([[{ text: "内部メモ" }]]), en: filled([]) },
              },
            },
          ],
        }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId])

    const counts = await rebuildSearchDocs(db)

    expect(counts.facetTerms).toBe(2)
    const texts = await db.select({ textJa: s.searchDoc.textJa }).from(s.searchDoc)
    expect(texts.every((row) => !row.textJa.includes("内部メモ"))).toBe(true)
  })

  it("takes the dates of an accession the archive issued from the cache", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId])
    await db.insert(s.accessionDate).values({
      accession: "JGAD000001",
      source: "ddbj-search",
      datePublished: "2018-04-02",
      dateModified: "2023-11-15",
    })

    await rebuildSearchDocs(db)

    const row = only((await docs()).filter((d) => d.targetType === "dataset"))
    expect(row.datePublished).toBe("2018-04-02")
    expect(row.dateModified).toBe("2023-11-15")
  })

  it("produces the same search_doc, facet-term, and facet-number rows when rebuilt again over its own existing rows", async () => {
    // A vocabulary set with a rollup (ICD10-shaped) and a flat one, plus a
    // number key, so both facet tables and the ancestor rollup are exercised.
    const { id: icd10SetId } = only(await db.insert(s.vocabularySet)
      .values({ code: "icd10", labelJa: "ICD10", labelEn: "ICD10", hierarchical: true })
      .returning({ id: s.vocabularySet.id }))
    const { id: parentTermId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId: icd10SetId, code: "E11", labelEn: "E11" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: childTermId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId: icd10SetId, code: "E11.9", labelEn: "E11.9", parentId: parentTermId })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: assaySetId } = only(await db.insert(s.vocabularySet)
      .values({ code: "assay", labelJa: "手法", labelEn: "Assay" })
      .returning({ id: s.vocabularySet.id }))
    const { id: rnaSeqTermId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId: assaySetId, code: "rna-seq", labelEn: "RNA-seq" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: diseaseKeyId } = only(await db.insert(s.contentKey)
      .values({ code: "disease", scope: "experiment", valueType: "vocabulary", labelJa: "疾患", labelEn: "Disease", vocabularySetId: icd10SetId })
      .returning({ id: s.contentKey.id }))
    const { id: assayKeyId } = only(await db.insert(s.contentKey)
      .values({ code: "assay", scope: "experiment", valueType: "vocabulary", labelJa: "手法", labelEn: "Assay", vocabularySetId: assaySetId })
      .returning({ id: s.contentKey.id }))
    const { id: volumeKeyId } = only(await db.insert(s.contentKey)
      .values({ code: "data-volume", scope: "experiment", valueType: "number", labelJa: "データ量", labelEn: "Data volume", canonicalUnit: "GB" })
      .returning({ id: s.contentKey.id }))

    const withExperiments = async (
      researchId: string,
      label: string,
      experiments: { id: string, keyId: string, value: ContentValue }[],
    ) => {
      const datasetId = await createDataset(researchId, label)
      await db.update(s.datasetContent).set({
        content: {
          ...emptyDatasetContent(),
          experiments: experiments.map((e) => ({
            id: e.id,
            label: filled(e.id),
            values: [{ keyId: e.keyId, value: e.value }],
          })),
        },
      }).where(eq(s.datasetContent.datasetId, datasetId))
      return datasetId
    }

    // research 1: two datasets, one of them with two experiments — a vocabulary
    // facet (with an ancestor to roll up to) and a number facet.
    const research1 = await createResearch("hum0001")
    const datasetA = await withExperiments(research1, "JGAD000001", [
      { id: "experiment-1", keyId: diseaseKeyId, value: { kind: "vocabulary", termIds: filled([childTermId]) } },
      { id: "experiment-2", keyId: volumeKeyId, value: { kind: "number", value: filled({ value: 5, unit: "GB", inputValue: 5, inputUnit: "GB" }) } },
    ])
    const datasetB = await withExperiments(research1, "JGAD000002", [
      { id: "experiment-1", keyId: assayKeyId, value: { kind: "vocabulary", termIds: filled([rnaSeqTermId]) } },
    ])
    const { id: snapshot1Id } = only(await db.insert(s.contentSnapshot)
      .values({
        researchId: research1,
        content: {
          ...emptyResearchContent(),
          title: { ja: filled("癌ゲノム研究"), en: filled("Cancer Genome Study") },
          datasetIds: [datasetA, datasetB],
        },
      })
      .returning({ id: s.contentSnapshot.id }))
    await db.insert(s.researchVersion)
      .values({ researchId: research1, number: 1, snapshotId: snapshot1Id, releaseDate: "2020-01-01" })

    // research 2: a second research, with its own dataset and its own values
    // under the same keys, so nothing about research 1 can leak into it.
    const research2 = await createResearch("hum0002")
    const datasetC = await withExperiments(research2, "JGAD000003", [
      { id: "experiment-1", keyId: diseaseKeyId, value: { kind: "vocabulary", termIds: filled([childTermId]) } },
      { id: "experiment-2", keyId: volumeKeyId, value: { kind: "number", value: filled({ value: 12.5, unit: "GB", inputValue: 12.5, inputUnit: "GB" }) } },
    ])
    const { id: snapshot2Id } = only(await db.insert(s.contentSnapshot)
      .values({
        researchId: research2,
        content: {
          ...emptyResearchContent(),
          title: { ja: filled("希少疾患コホート"), en: filled("Rare Disease Cohort") },
          datasetIds: [datasetC],
        },
      })
      .returning({ id: s.contentSnapshot.id }))
    await db.insert(s.researchVersion)
      .values({ researchId: research2, number: 1, snapshotId: snapshot2Id, releaseDate: "2021-06-15" })

    const orderedDocs = () => db
      .select({
        targetType: s.searchDoc.targetType,
        targetId: s.searchDoc.targetId,
        researchId: s.searchDoc.researchId,
        humLabel: s.searchDoc.humLabel,
        versionNumber: s.searchDoc.versionNumber,
        datasetLabel: s.searchDoc.datasetLabel,
        datePublished: s.searchDoc.datePublished,
        dateModified: s.searchDoc.dateModified,
        title: s.searchDoc.title,
        textJa: s.searchDoc.textJa,
        textEn: s.searchDoc.textEn,
      })
      .from(s.searchDoc)
      .orderBy(s.searchDoc.targetType, s.searchDoc.targetId)

    // Facet rows reference a fresh `search_doc.id` every rebuild, so the two
    // runs are compared by what the row is *about* (its document's stable
    // target) rather than by that regenerated key.
    const orderedFacetTerms = () => db
      .select({
        targetType: s.searchDoc.targetType,
        targetId: s.searchDoc.targetId,
        keyId: s.searchFacetTerm.keyId,
        termId: s.searchFacetTerm.termId,
        ancestorIds: s.searchFacetTerm.ancestorIds,
      })
      .from(s.searchFacetTerm)
      .innerJoin(s.searchDoc, eq(s.searchDoc.id, s.searchFacetTerm.docId))
      .orderBy(s.searchDoc.targetId, s.searchFacetTerm.keyId, s.searchFacetTerm.termId)

    const orderedFacetNumbers = () => db
      .select({
        targetType: s.searchDoc.targetType,
        targetId: s.searchDoc.targetId,
        keyId: s.searchFacetNumber.keyId,
        value: s.searchFacetNumber.value,
      })
      .from(s.searchFacetNumber)
      .innerJoin(s.searchDoc, eq(s.searchDoc.id, s.searchFacetNumber.docId))
      .orderBy(s.searchDoc.targetId, s.searchFacetNumber.keyId, s.searchFacetNumber.value)

    await rebuildSearchDocs(db)
    const firstDocs = await orderedDocs()
    const firstFacetTerms = await orderedFacetTerms()
    const firstFacetNumbers = await orderedFacetNumbers()
    expect(firstDocs.length).toBeGreaterThan(0)
    expect(firstFacetTerms.length).toBeGreaterThan(0)
    expect(firstFacetNumbers.length).toBeGreaterThan(0)

    // The second run starts from a database that already holds the first
    // run's rows, which is the case the rule actually has to hold under.
    await rebuildSearchDocs(db)

    expect(await orderedDocs()).toEqual(firstDocs)
    expect(await orderedFacetTerms()).toEqual(firstFacetTerms)
    expect(await orderedFacetNumbers()).toEqual(firstFacetNumbers)
  })
})

/**
 * A publish moves one research, and rebuilding everything for it would rewrite
 * thousands of rows nothing touched. The scope has to reach everything that
 * research owns and nothing that it does not — which holds because a dataset
 * belongs to exactly one research, and so do its versions and its labels.
 */
describe("rebuilding one research", () => {
  it("leaves every other research's rows exactly as they were", async () => {
    const mine = await createResearch("hum0001")
    await publish(mine, 1, [await createDataset(mine, "JGAD000001")])
    const other = await createResearch("hum0002")
    await publish(other, 1, [await createDataset(other, "JGAD000002")])
    await rebuildSearchDocs(db)
    const before = (await docs()).filter((row) => row.humLabel === "hum0002")

    const counts = await rebuildSearchDocs(db, { researchIds: [mine] })

    expect(counts).toMatchObject({ research: 1, researchVersions: 1, datasets: 1 })
    expect((await docs()).filter((row) => row.humLabel === "hum0002")).toEqual(before)
    expect(await docs()).toHaveLength(6)
  })

  it("derives the same rows the whole rebuild would", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [await createDataset(researchId, "JGAD000001")])
    await rebuildSearchDocs(db)
    const whole = await docs()

    await rebuildSearchDocs(db, { researchIds: [researchId] })

    expect(await docs()).toEqual(whole)
  })

  it("takes away the rows of a research that no longer has anything published", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [await createDataset(researchId, "JGAD000001")])
    await rebuildSearchDocs(db)

    await db.update(s.researchVersion).set({ published: false })
    await rebuildSearchDocs(db, { researchIds: [researchId] })

    expect(await docs()).toEqual([])
  })

  it("does nothing at all when asked for no research", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [])
    await rebuildSearchDocs(db)
    const before = await docs()

    const counts = await rebuildSearchDocs(db, { researchIds: [] })

    expect(counts).toEqual({
      research: 0,
      researchVersions: 0,
      datasets: 0,
      facetTerms: 0,
      facetNumbers: 0,
    })
    expect(await docs()).toEqual(before)
  })
})
