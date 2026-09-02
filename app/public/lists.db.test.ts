import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { rebuildSearchDocs } from "~/search/rebuild.server"

import type { FacetPanelView, FacetView } from "./facets.server"
import { canonicalRedirect, datasetListPage, researchListPage } from "./lists.server"

/**
 * These go through the same functions the listing loaders call, against the
 * development database. What they are here for is the part the unit tests
 * cannot reach: that the set comes from the published rows, that the address
 * and the box agree, and that a condition the box cannot show is still shown.
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

async function createDataset(
  researchId: string,
  label: string,
  experimentLabel?: string,
): Promise<string> {
  const { id } = only(await db.insert(s.dataset).values({ researchId })
    .returning({ id: s.dataset.id }))
  await db.insert(s.labelPin).values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  await db.insert(s.datasetContent).values({
    datasetId: id,
    content: experimentLabel === undefined
      ? emptyDatasetContent()
      : {
          ...emptyDatasetContent(),
          experiments: [{
            id: "experiment-1",
            label: filled(experimentLabel),
            values: [],
          }],
        },
  })
  return id
}

async function publish(
  researchId: string,
  number: number,
  datasetIds: string[],
  title: string,
  options: { published?: boolean } = {},
): Promise<void> {
  const { id: snapshotId } = only(await db.insert(s.contentSnapshot)
    .values({
      researchId,
      content: {
        ...emptyResearchContent(),
        title: { ja: filled(title), en: filled(title) },
        datasetIds,
      },
    })
    .returning({ id: s.contentSnapshot.id }))
  await db.insert(s.researchVersion).values({
    researchId,
    number,
    snapshotId,
    releaseDate: "2020-01-01",
    published: options.published ?? true,
  })
}

function request(path: string) {
  return { locale: "ja" as const, url: new URL(`http://localhost${path}`) }
}

describe("the research listing", () => {
  it("shows only what is published, whichever way it is reached", async () => {
    const shown = await createResearch("hum0001")
    await publish(shown, 1, [], "公開された研究")
    const hidden = await createResearch("hum0002")
    await publish(hidden, 1, [], "未公開の研究", { published: false })
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research"))

    expect(view.rows.map((row) => row.humLabel)).toEqual(["hum0001"])
    expect((await researchListPage(request("/research?q=%E7%A0%94%E7%A9%B6"))).total).toBe(1)
  })

  it("finds a research by a word written inside one of its datasets", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001", "ATAC-seq")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=ATAC-seq"))

    expect(view.rows.map((row) => row.humLabel)).toEqual(["hum0001"])
  })

  it("says how many the other listing matches for the same words", async () => {
    const researchId = await createResearch("hum0001")
    const first = await createDataset(researchId, "JGAD000001", "ATAC-seq")
    const second = await createDataset(researchId, "JGAD000002", "ATAC-seq")
    await publish(researchId, 1, [first, second], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=ATAC-seq"))

    expect(view.total).toBe(1)
    expect(view.otherCount).toBe(2)
  })

  it("leaves the other count out when nothing was searched for", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "研究題目")
    await rebuildSearchDocs(db)

    expect((await researchListPage(request("/research"))).otherCount).toBeNull()
  })

  it("shows a condition the box cannot hold, with the address that removes it", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "ゲノム解析")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%E8%A7%A3%E6%9E%90+title%3A%E3%82%B2%E3%83%8E%E3%83%A0"))

    expect(view.keyword).toBe("解析")
    // The words the box holds are listed too, so the condition it cannot hold
    // is the second of them rather than the only one.
    expect(view.conditions[1]?.field).toBe("研究題目")
    expect(view.conditions[1]?.value).toBe("ゲノム")
    expect(view.conditions[1]?.href).toBe("/research?q=%E8%A7%A3%E6%9E%90")
  })

  /*
    **What is narrowing the listing is one list, read off one tree.** The box is
    where the typed words are edited, but they narrow the result exactly as a
    chosen value does — a reader looking for why 198 of 397 rows are showing
    has to find the word among the reasons, not in a box above them.
  */
  it("counts the typed words among the conditions in force", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "ゲノム解析")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%E8%A7%A3%E6%9E%90"))

    expect(view.keyword).toBe("解析")
    expect(view.conditions).toHaveLength(1)
    expect(view.conditions[0]?.field).toBe("キーワード")
    expect(view.conditions[0]?.value).toBe("解析")
    expect(view.conditions[0]?.href).toBe("/research")
  })

  it("gives each typed word its own way off, keeping the others", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "ゲノム解析")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%E8%A7%A3%E6%9E%90+AND+%E3%82%B2%E3%83%8E%E3%83%A0"))

    expect(view.conditions.map((chip) => chip.value)).toEqual(["解析", "ゲノム"])
    expect(view.conditions.map((chip) => decodeURIComponent(chip.href)))
      .toEqual(["/research?q=ゲノム", "/research?q=解析"])
  })

  /*
    **Lifting everything lifts the words too.** They are one of the conditions
    listed, and a control saying it takes all of them off while one stays is
    saying something untrue about the list directly above it.
  */
  it("empties the box as well when everything in force is lifted", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "ゲノム解析")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%E8%A7%A3%E6%9E%90+title%3A%E3%82%B2%E3%83%8E%E3%83%A0"))

    expect(view.conditions).toHaveLength(2)
    expect(view.clearHref).toBe("/research")
  })

  it("answers a query it cannot read with the failure rather than with everything", async () => {
    const researchId = await createResearch("hum0001")
    await publish(researchId, 1, [], "研究題目")
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research?q=%28"))

    expect(view.parseError?.code).toBe("unexpected-token")
    expect(view.rows).toEqual([])
    expect(view.total).toBe(0)
  })

  /**
   * The ordering a reader is reading in may not change under them for having
   * refined: an ordering that only some queries can carry would come and go
   * with the shape of the query.
   */
  it("opens on the newest change, whether or not words were searched for", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)

    expect((await researchListPage(request("/research"))).sort).toBe("dateModified")
    expect((await researchListPage(request("/research?q=%E7%A0%94%E7%A9%B6"))).sort).toBe("dateModified")
    expect((await datasetListPage(request("/dataset"))).sort).toBe("dateModified")
  })
})

describe("the dataset listing", () => {
  it("names the research each dataset belongs to", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)

    const view = await datasetListPage(request("/dataset"))

    expect(view.rows.map((row) => [row.label, row.humLabel])).toEqual([["JGAD000001", "hum0001"]])
  })

  it("stops listing a dataset no published version points at", async () => {
    const researchId = await createResearch("hum0001")
    const datasetId = await createDataset(researchId, "JGAD000001")
    await publish(researchId, 1, [datasetId], "研究題目")
    await rebuildSearchDocs(db)
    await db.update(s.contentSnapshot).set({
      content: { ...emptyResearchContent(), datasetIds: [] },
    }).where(eq(s.contentSnapshot.researchId, researchId))
    await rebuildSearchDocs(db)

    expect((await datasetListPage(request("/dataset"))).total).toBe(0)
  })
})

describe("a search submitted from the box", () => {
  it("is answered with the address it should have, so it can be shared", async () => {
    const answer = await canonicalRedirect(
      new URL("http://localhost/research?k=NGS%28Exome%29"),
      "research",
      "ja",
    )
    expect(answer?.status).toBe(302)
    expect(answer?.headers.get("location")).toBe("/research?q=%22NGS%28Exome%29%22")
  })

  it("keeps the conditions the box does not show", async () => {
    const answer = await canonicalRedirect(
      new URL("http://localhost/research?k=%E8%A7%A3%E6%9E%90&q=title%3A%E3%82%B2%E3%83%8E%E3%83%A0"),
      "research",
      "ja",
    )
    const location = answer?.headers.get("location") ?? ""
    const written = new URL(location, "http://localhost").searchParams.get("q")
    expect(written).toBe("解析 AND title:ゲノム")
  })

  it("is left alone when the box was not used", async () => {
    const answer = await canonicalRedirect(new URL("http://localhost/research?q=a"), "research", "ja")
    expect(answer).toBeNull()
  })

  it("turns a range typed into a numeric facet into the address it stands for", async () => {
    await db.insert(s.contentKey).values({
      code: "read-length",
      scope: "experiment",
      valueType: "number",
      labelJa: "リード長",
      labelEn: "Read Length",
      canonicalUnit: "bp",
      inputUnits: ["bp"],
    })

    const answer = await canonicalRedirect(
      new URL("http://localhost/dataset?rangeKey=read-length&rangeFrom=100&rangeTo="),
      "dataset",
      "ja",
    )
    // An end left blank is an end that is not being asked about.
    expect(answer?.headers.get("location")).toBe("/dataset?q=read-length%3A%5B100+TO+*%5D")
  })

  it("leaves the search alone when the range names something that is not a facet", async () => {
    const answer = await canonicalRedirect(
      new URL("http://localhost/dataset?q=cancer&rangeKey=not-a-facet&rangeFrom=1&rangeTo=2"),
      "dataset",
      "ja",
    )
    expect(answer?.headers.get("location")).toBe("/dataset?q=cancer")
  })

  it("writes the address of the other language when that is where it came from", async () => {
    const answer = await canonicalRedirect(
      new URL("http://localhost/en/dataset?k=cancer"),
      "dataset",
      "en",
    )
    expect(answer?.headers.get("location")).toBe("/en/dataset?q=cancer")
  })
})

/**
 * A vocabulary with a shape, a key typed against it, and datasets filed under
 * its narrow codes. This is what the panel is drawn from end to end.
 */
async function withDiseases(): Promise<void> {
  const { id: setId } = only(await db.insert(s.vocabularySet)
    .values({
      code: "icd10",
      labelJa: "ICD10",
      labelEn: "ICD10",
      hierarchical: true,
    })
    .returning({ id: s.vocabularySet.id }))
  const { id: category } = only(await db.insert(s.facetCategory)
    .values({ code: "experiment", labelJa: "実験", labelEn: "Experiment" })
    .returning({ id: s.facetCategory.id }))
  const term = async (code: string, parentId?: string) => only(await db.insert(s.vocabularyTerm)
    .values({ setId, code, labelEn: code, parentId })
    .returning({ id: s.vocabularyTerm.id })).id
  const lung = await term("C34")
  const lungUnspecified = await term("C349", lung)
  const prostate = await term("C61")
  const { id: keyId } = only(await db.insert(s.contentKey)
    .values({
      code: "disease-icd10",
      scope: "experiment",
      valueType: "vocabulary",
      labelJa: "疾患",
      labelEn: "Disease",
      vocabularySetId: setId,
      facetCategoryId: category,
      multiple: true,
      showOnPublicPage: false,
    })
    .returning({ id: s.contentKey.id }))

  const filed = async (humLabel: string, datasetLabel: string, termId: string) => {
    const researchId = await createResearch(humLabel)
    const datasetId = await createDataset(researchId, datasetLabel)
    await db.update(s.datasetContent).set({
      content: {
        ...emptyDatasetContent(),
        experiments: [{
          id: "experiment-1",
          label: filled("WES"),
          values: [{ keyId, value: { kind: "vocabulary", termIds: filled([termId]) } }],
        }],
      },
    }).where(eq(s.datasetContent.datasetId, datasetId))
    await publish(researchId, 1, [datasetId], humLabel)
  }
  await filed("hum0001", "JGAD000001", lungUnspecified)
  await filed("hum0002", "JGAD000002", prostate)
  await rebuildSearchDocs(db)
  // The dictionary holds one more code than the vocabulary does, which is what
  // lets "no data" be told apart from "no such code".
  await db.insert(s.icd10Reference).values([
    { code: "C34", titleEn: "Bronchus and lung", titleJa: "気管支及び肺" },
    { code: "C349", titleEn: "Bronchus or lung", titleJa: "気管支又は肺" },
    { code: "C61", titleEn: "Prostate", titleJa: "前立腺" },
    { code: "A00", titleEn: "Cholera", titleJa: "コレラ" },
  ])
}

function facetOf(view: { facets: FacetPanelView | null }, code: string): FacetView {
  const held = (view.facets?.categories ?? [])
    .flatMap((category) => category.facets)
    .find((facet) => facet.code === code)
  if (held === undefined) throw new Error(`the panel has no ${code}`)
  return held
}

describe("refining a listing", () => {
  it("offers a hierarchical facet at the top of its tree, counted over the result", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset"))

    const disease = facetOf(view, "disease-icd10")
    expect(disease.values.map((value) => [value.code, value.count]))
      .toEqual([["C34", 1], ["C61", 1]])
  })

  it("matches what is filed under a narrower code when a broad one is chosen", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset?q=disease-icd10%3AC34"))

    expect(view.rows.map((row) => row.label)).toEqual(["JGAD000001"])
    // The chosen value is drawn as chosen, and the address beside it takes it off.
    const chosen = facetOf(view, "disease-icd10").values.find((value) => value.selected)
    expect(chosen?.code).toBe("C34")
    expect(chosen?.href).toBe("/dataset")
  })

  it("refines the research listing by the values of the datasets below it", async () => {
    await withDiseases()

    const view = await researchListPage(request("/research?q=disease-icd10%3AC34"))

    expect(view.rows.map((row) => row.humLabel)).toEqual(["hum0001"])
  })

  it("counts a facet with its own condition lifted, so a second value is reachable", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset?q=disease-icd10%3AC34"))

    // One row matches, and the value that is not chosen still says what it
    // would add — a count taken under the whole query would be zero and gone.
    expect(view.total).toBe(1)
    expect(facetOf(view, "disease-icd10").values.map((value) => [value.code, value.count]))
      .toEqual([["C34", 1], ["C61", 1]])
  })

  it("**counts a chosen narrower code at its own level**, rather than saying it matches nothing", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset?q=disease-icd10%3AC349"))

    // The rolled-up counts are taken at the root, so a four-digit code is not
    // among them. Reading zero off its own row would say the opposite of the
    // result beside it.
    expect(view.rows.map((row) => row.label)).toEqual(["JGAD000001"])
    const chosen = facetOf(view, "disease-icd10").values.find((value) => value.selected)
    expect(chosen?.code).toBe("C349")
    expect(chosen?.count).toBe(1)
  })

  it("shows what a chosen value is as a chip, and where to take it off", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset?q=disease-icd10%3AC34"))

    expect(view.conditions.map((chip) => `${chip.field ?? ""}/${chip.value}`)).toEqual(["疾患/C34"])
    expect(view.conditions.map((chip) => chip.href)).toEqual(["/dataset"])
  })

  it("shows what sits under a value only once the facet has been opened", async () => {
    await withDiseases()

    const shut = facetOf(await datasetListPage(request("/dataset")), "disease-icd10")
    expect(shut.values.every((value) => value.children.length === 0)).toBe(true)

    const open = facetOf(
      await datasetListPage(request("/dataset?facet=disease-icd10")),
      "disease-icd10",
    )
    expect(open.expanded).toBe(true)
    expect(open.values.find((value) => value.code === "C34")?.children.map((one) => one.code))
      .toEqual(["C349"])
  })

  it("looks for a value by its code inside an opened facet", async () => {
    await withDiseases()

    const view = await datasetListPage(request("/dataset?facet=disease-icd10&find=C6"))

    expect(facetOf(view, "disease-icd10").values.map((value) => value.code)).toEqual(["C61"])
  })
})

describe("a facet with more values than the panel shows", () => {
  /** A flat vocabulary with one more term than the panel has room for. */
  async function withManyMethods(count: number): Promise<void> {
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "assay", labelJa: "手法", labelEn: "Assay" })
      .returning({ id: s.vocabularySet.id }))
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({
        code: "assay",
        scope: "experiment",
        valueType: "vocabulary",
        labelJa: "実験方法",
        labelEn: "Assay",
        vocabularySetId: setId,
        multiple: true,
      })
      .returning({ id: s.contentKey.id }))

    for (let at = 0; at < count; at += 1) {
      const code = `method-${String(at).padStart(2, "0")}`
      const { id: termId } = only(await db.insert(s.vocabularyTerm)
        .values({ setId, code, labelEn: code })
        .returning({ id: s.vocabularyTerm.id }))
      const humLabel = `hum${String(at + 1).padStart(4, "0")}`
      const researchId = await createResearch(humLabel)
      const datasetId = await createDataset(researchId, `JGAD${String(at + 1).padStart(6, "0")}`)
      await db.update(s.datasetContent).set({
        content: {
          ...emptyDatasetContent(),
          experiments: [{
            id: "experiment-1",
            label: filled(code),
            values: [{ keyId, value: { kind: "vocabulary", termIds: filled([termId]) } }],
          }],
        },
      }).where(eq(s.datasetContent.datasetId, datasetId))
      await publish(researchId, 1, [datasetId], humLabel)
    }
    await rebuildSearchDocs(db)
  }

  it("shows ten of them and offers the rest one link away", async () => {
    await withManyMethods(11)

    const shut = facetOf(await datasetListPage(request("/dataset")), "assay")
    expect(shut.values).toHaveLength(10)
    expect(shut.moreHref).toBe("/dataset?facet=assay")

    const open = facetOf(await datasetListPage(request("/dataset?facet=assay")), "assay")
    expect(open.values).toHaveLength(11)
    expect(open.moreHref).toBeNull()
  })

  it("keeps a chosen value on the panel even when nothing matches it any more", async () => {
    await withManyMethods(2)

    // A keyword nothing carries, so every count is zero and every unchosen
    // value is gone; the chosen one has to stay or it cannot be taken off.
    const view = await datasetListPage(request("/dataset?q=zzzz+assay%3Amethod-00"))

    expect(view.total).toBe(0)
    const values = facetOf(view, "assay").values
    expect(values.map((value) => [value.code, value.count, value.selected]))
      .toEqual([["method-00", 0, true]])
  })
})

describe("a disease named by its code", () => {
  const typed = async (code: string) =>
    canonicalRedirect(
      new URL(`http://localhost/research?code=${encodeURIComponent(code)}`),
      "research",
      "ja",
    )

  it("becomes the condition choosing the value would have made", async () => {
    await withDiseases()

    const answer = await typed("c34.9")

    // The same condition either way, so the rollup and the counting do not
    // depend on how the reader got there.
    expect(answer?.headers.get("location")).toBe("/research?q=disease-icd10%3AC349")
  })

  it("asks for a value that is already in force rather than taking it off", async () => {
    await withDiseases()

    const answer = await canonicalRedirect(
      new URL("http://localhost/research?q=disease-icd10%3AC349&code=C349"),
      "research",
      "ja",
    )

    expect(answer?.headers.get("location")).toBe("/research?q=disease-icd10%3AC349")
  })

  it("is answered on the page when the classification holds it but nothing published does", async () => {
    await withDiseases()

    expect(await typed("A00")).toBeNull()
    const view = await researchListPage(request("/research?code=A00"))
    expect(facetOf(view, "disease-icd10").codeEntry)
      .toEqual({ value: "A00", problem: "no-data" })
  })

  it("is answered on the page when the classification does not hold it at all", async () => {
    await withDiseases()

    expect(await typed("Z99")).toBeNull()
    const view = await researchListPage(request("/research?code=Z99"))
    expect(facetOf(view, "disease-icd10").codeEntry)
      .toEqual({ value: "Z99", problem: "unknown-code" })
  })

  it("says the same of something that is not shaped like a code", async () => {
    await withDiseases()

    const view = await researchListPage(request("/research?code=肺がん"))
    expect(facetOf(view, "disease-icd10").codeEntry?.problem).toBe("unknown-code")
  })

  it("offers the box on the disease facet and on no other", async () => {
    await withDiseases()
    const { id: setId } = only(await db.insert(s.vocabularySet)
      .values({ code: "assay", labelJa: "手法", labelEn: "Assay" })
      .returning({ id: s.vocabularySet.id }))
    const { id: termId } = only(await db.insert(s.vocabularyTerm)
      .values({ setId, code: "wgs", labelEn: "WGS" })
      .returning({ id: s.vocabularyTerm.id }))
    const { id: keyId } = only(await db.insert(s.contentKey)
      .values({
        code: "assay",
        scope: "experiment",
        valueType: "vocabulary",
        labelJa: "実験方法",
        labelEn: "Assay",
        vocabularySetId: setId,
      })
      .returning({ id: s.contentKey.id }))
    for (const row of await db.select().from(s.datasetContent)) {
      const held = row.content
      await db.update(s.datasetContent).set({
        content: {
          ...held,
          experiments: held.experiments.map((experiment) => ({
            ...experiment,
            values: [
              ...experiment.values,
              { keyId, value: { kind: "vocabulary" as const, termIds: filled([termId]) } },
            ],
          })),
        },
      }).where(eq(s.datasetContent.datasetId, row.datasetId))
    }
    await rebuildSearchDocs(db)

    const view = await researchListPage(request("/research"))

    expect(facetOf(view, "disease-icd10").codeEntry).toEqual({ value: "", problem: null })
    expect(facetOf(view, "assay").codeEntry).toBeNull()
  })
})
