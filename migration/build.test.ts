import { describe, expect, it } from "vitest"

import { isPortalIssuedId } from "~/admin/labels"
import { filled } from "~/content/empty"
import type { Slot, ValueSlot } from "~/content/types"

import { buildCauRows, buildDatasetContent, buildResearchContent, captionOf, narrowedToCaption, ownLines, type ProseReader } from "./build"
import type { EsDataset, EsExperiment, EsResearchVersion, PublishedDataset } from "./es"
import { byHand, labelTranslations, type LabelTranslations, type ReadNumber } from "./numbers"

interface UnreadLine { dataset: string, sourceKey: string, line: string }

function version(overrides: Partial<EsResearchVersion> = {}): EsResearchVersion {
  return {
    humId: "hum0001",
    humVersionId: "hum0001-v1",
    version: "v1",
    versionReleaseDate: "2020-01-01",
    ...overrides,
  }
}

function build(rv: EsResearchVersion, datasetIdByLabel = new Map<string, string>()) {
  return buildResearchContent({ version: rv, listingSummary: null, datasetIdByLabel })
}

const KEY_IDS = new Map([
  ["access-criteria", "key-criteria"],
  ["type-of-data", "key-type"],
  ["materials-and-participants", "key-materials"],
  ["total-data-volume", "key-volume"],
  ["read-length", "key-read-length"],
  ["coverage-depth", "key-coverage-depth"],
  ["coverage-breadth", "key-coverage-breadth"],
  ["experimental-method", "key-method"],
])
const CODE_BY_SOURCE = new Map([
  ["Materials and Participants", "materials-and-participants"],
  ["Experimental Method", "experimental-method"],
  ["Total Data Volume", "total-data-volume"],
  ["Read Length", "read-length"],
  // The split's first key stands for the source cell (`catalog.ts`).
  ["Coverage", "coverage-depth"],
])
const TERM_IDS = new Map([
  ["access-criteria/unrestricted-access", "term-unrestricted"],
  ["access-criteria/controlled-access-type-1", "term-type-1"],
])

function dumpRow(doc: Partial<EsDataset>, label: string, firstListedOn: string | null): PublishedDataset {
  return {
    label,
    humId: "hum0001",
    firstListedOn,
    doc: { datasetId: label, version: "v1", humId: "hum0001", ...doc },
  }
}

function dataset(doc: Partial<EsDataset>, label = "JGAD000001", firstListedOn: string | null = "2020-01-01") {
  return datasetOf([dumpRow(doc, label, firstListedOn)], label)
}

/** The whole set, since a cell may hold lines about the others. */
function datasetOf(
  all: readonly PublishedDataset[],
  label: string,
  readProse?: ProseReader,
  unread: UnreadLine[] = [],
  hand: ReadonlyMap<string, ReadNumber[]> = new Map(),
  translations?: LabelTranslations,
) {
  const one = all.find((row) => row.label === label)
  if (one === undefined) throw new Error(`no dataset ${label}`)
  return buildDatasetContent({
    dataset: one,
    keyIdByCode: KEY_IDS,
    codeBySourceKey: CODE_BY_SOURCE,
    termIdBySetAndCode: TERM_IDS,
    knownCode: () => false,
    accessCriteriaKeyCode: "access-criteria",
    typeOfDataKeyCode: "type-of-data",
    datasetLabels: new Set(all.map((row) => row.label)),
    ownLines: ownLines(all, readProse),
    unread,
    byHand: hand,
    labelTranslations: translations,
    readProse,
  })
}

function first<T>(items: T[]): T {
  const [item] = items
  if (item === undefined) throw new Error("expected at least one element")
  return item
}

function value<T>(slot: Slot<T>): T {
  if (slot.state !== "value") throw new Error(`expected a value, got ${slot.state}`)
  return slot.value
}

describe("buildResearchContent", () => {
  it("turns a field v1 never filled in into an empty value rather than unknown", () => {
    const content = build(version())
    expect(content.title).toEqual({ ja: filled(""), en: filled("") })
    expect(content.releaseNote).toEqual({ ja: filled([]), en: filled([]) })
    expect(content.summary.url).toEqual({ ja: filled([]), en: filled([]) })
  })

  it("takes the extracted text and leaves the HTML behind", () => {
    const content = build(version({
      summary: { aims: { ja: { text: "目的", rawHtml: "<b>目的</b>" } } },
    }))
    expect(content.summary.aims).toEqual({ ja: filled([[{ text: "目的" }]]), en: filled([]) })
  })

  it("reads the markdown of a prose field into lines and links", () => {
    const content = build(version({
      summary: { methods: { ja: { text: "詳細は [NBDC policy](/nbdc-policy) を参照\n2 行目" } } },
    }))
    expect(value(content.summary.methods.ja)).toEqual([
      [{ text: "詳細は " }, { text: "NBDC policy", href: "/nbdc-policy" }, { text: " を参照" }],
      [{ text: "2 行目" }],
    ])
  })

  it("reads the single-line values through the text reader, but not the title", () => {
    const content = buildResearchContent({
      version: version({
        title: { ja: "題名 (1)", en: "Title" },
        dataProvider: [{ name: { ja: { text: "山田 太郎" } }, organization: { name: { ja: { text: "大学 (本部)" } } } }],
        researchProject: [{ name: { ja: { text: "計画 (A)" } } }],
        grant: [{ title: { ja: "課題 (B)" }, agency: { name: { ja: "機関 (C)" } }, id: ["16H06279"] }],
        relatedPublication: [{ title: { en: "Parkinson's" } }],
      }),
      listingSummary: null,
      datasetIdByLabel: new Map(),
      readText: (text, lang) => lang === "ja" ? text.replace(/ \(/g, "（").replace(/\)/g, "）") : text.toUpperCase(),
    })

    expect(value(content.title.ja)).toBe("題名 (1)")
    expect(value(first(content.dataProviders).organization.name.ja)).toBe("大学（本部）")
    expect(value(first(content.researchProjects).name.ja)).toBe("計画（A）")
    expect(value(first(content.grants).title.ja)).toBe("課題（B）")
    expect(value(first(content.grants).agency.name.ja)).toBe("機関（C）")
    expect(first(content.grants).grantIds).toEqual({ state: "value", value: ["16H06279"] })
    expect(value(first(content.relatedPublications).title)).toBe("PARKINSON'S")
  })

  it("reads the listing summary through the listing's reader and the research's prose through its own", () => {
    const content = buildResearchContent({
      version: version({ summary: { aims: { ja: { text: "目的" } } } }),
      listingSummary: { methods: { ja: { text: "配列決定" } } },
      datasetIdByLabel: new Map(),
      readProse: (leaf) => [[{ text: `research: ${leaf?.text ?? ""}` }]],
      readListing: (leaf) => [[{ text: `listing: ${leaf?.text ?? ""}` }]],
    })

    expect(value(content.summary.aims.ja)).toEqual([[{ text: "research: 目的" }]])
    expect(value(content.listingSummary.methods.ja)).toEqual([[{ text: "listing: 配列決定" }]])
  })

  it("keeps a publication title single-valued, preferring the English side", () => {
    const content = build(version({
      relatedPublication: [{ title: { ja: "和文", en: "English" } }],
    }))
    expect(value(first(content.relatedPublications).title)).toBe("English")
  })

  it("falls back to the other language when one side of a single value is empty", () => {
    const content = build(version({ relatedPublication: [{ title: { ja: "和文", en: "" } }] }))
    expect(value(first(content.relatedPublications).title)).toBe("和文")
  })

  it("replaces dataset labels with identities and drops the ones not published", () => {
    const content = build(
      version({
        datasets: [
          { datasetId: "JGAD1", version: "v1" },
          { datasetId: "JGAD2", version: "v1" },
        ],
        relatedPublication: [{ title: { en: "P" }, datasetIds: ["JGAD1", "JGAD2"] }],
      }),
      new Map([["JGAD1", "identity-1"]]),
    )
    expect(content.datasetIds).toEqual(["identity-1"])
    expect(first(content.relatedPublications).datasetIds).toEqual({ state: "value", value: ["identity-1"] })
    // Not in the `label_pin` table, but shaped as an accession: kept as the ID.
    expect(first(content.relatedPublications).externalIds).toEqual(["JGAD2"])
  })

  it("keeps a publication's citation of another research's dataset as the ID, not the identity", () => {
    const content = buildResearchContent({
      version: version({
        humId: "hum0001",
        relatedPublication: [{ title: { en: "P" }, datasetIds: ["JGAD000001", "JGAD000009"] }],
      }),
      listingSummary: null,
      datasetIdByLabel: new Map([["JGAD000001", "identity-1"], ["JGAD000009", "identity-9"]]),
      humOfLabel: new Map([["JGAD000001", "hum0001"], ["JGAD000009", "hum0009"]]),
    })
    expect(first(content.relatedPublications).datasetIds).toEqual({ state: "value", value: ["identity-1"] })
    expect(first(content.relatedPublications).externalIds).toEqual(["JGAD000009"])
  })

  it("folds JGA's long form before looking it up, and drops a placeholder of zeros", () => {
    const content = buildResearchContent({
      version: version({
        humId: "hum0012",
        relatedPublication: [{
          title: { en: "P" },
          datasetIds: ["JGAD00000000012", "JGAD00000000227", "JGAD000000", "JGAD00000000000", "DRA000000", "DRA007067", "JGAD00000000227"],
        }],
      }),
      listingSummary: null,
      datasetIdByLabel: new Map([["JGAD000012", "identity-12"]]),
      humOfLabel: new Map([["JGAD000012", "hum0012"]]),
    })
    expect(first(content.relatedPublications).datasetIds).toEqual({ state: "value", value: ["identity-12"] })
    expect(first(content.relatedPublications).externalIds).toEqual(["JGAD000227", "DRA007067"])
  })

  it("keeps the two languages of a URL apart, because they are different pages", () => {
    const content = build(version({
      summary: {
        url: {
          ja: [{ text: "研究室", url: "https://example.jp/" }],
          en: [{ text: "Lab", url: "https://example.com/en/" }],
        },
      },
    }))
    expect(value(content.summary.url.ja).map((l) => l.url)).toEqual(["https://example.jp/"])
    expect(value(content.summary.url.en).map((l) => l.url)).toEqual(["https://example.com/en/"])
  })

  it("drops a link that has no destination", () => {
    const content = build(version({
      summary: { url: { ja: [{ text: "見出しだけ" }, { url: "https://example.jp/" }] } },
    }))
    expect(value(content.summary.url.ja)).toHaveLength(1)
  })

  it("gives every array element an identity so a comment can address it", () => {
    const content = build(version({
      grant: [{ title: { ja: "A" } }, { title: { ja: "B" } }],
      dataProvider: [{ name: { ja: { text: "甲" } } }, { name: { ja: { text: "乙" } } }],
    }))
    expect(content.grants.map((g) => g.id)).toEqual(["grant-1", "grant-2"])
    expect(new Set(content.dataProviders.map((p) => p.id)).size).toBe(2)
  })

  it("puts the short summary on the version it was given and nowhere else", () => {
    const listingSummary = { methods: { ja: { text: "配列決定" } } }
    const withIt = buildResearchContent({
      version: version(),
      listingSummary,
      datasetIdByLabel: new Map(),
    })
    const withoutIt = build(version())
    expect(value(withIt.listingSummary.methods.ja)).toEqual([[{ text: "配列決定" }]])
    expect(value(withoutIt.listingSummary.methods.ja)).toEqual([])
  })
})

describe("buildDatasetContent", () => {
  it("stores the access criteria as a vocabulary term", () => {
    const content = dataset({ criteria: "Unrestricted-access" })
    expect(content.values).toContainEqual({
      keyId: "key-criteria",
      value: { kind: "vocabulary", termIds: filled(["term-unrestricted"]) },
    })
  })

  it("leaves the criteria out when v1 recorded a value the vocabulary has no term for", () => {
    const content = dataset({ criteria: "Something else" })
    expect(content.values.map((v) => v.keyId)).not.toContain("key-criteria")
  })

  it("maps an experiment value onto the catalog key it belongs to", () => {
    const content = dataset({
      experiments: [{ data: { "Materials and Participants": { ja: { text: "3 名" }, en: { text: "3 people" } } } }],
    })
    expect(first(content.experiments).values).toEqual([{
      keyId: "key-materials",
      value: {
        kind: "text",
        text: { ja: filled([[{ text: "3 名" }]]), en: filled([[{ text: "3 people" }]]) },
      },
    }])
  })

  it("refuses a key the catalog does not know rather than inventing one", () => {
    expect(() => dataset({ experiments: [{ data: { Unheard: { ja: { text: "x" } } } }] }))
      .toThrow(/Unheard/)
  })

  it("drops a value that is empty in both languages", () => {
    const content = dataset({ experiments: [{ data: { "Materials and Participants": { ja: { text: "" } } } }] })
    expect(first(content.experiments).values).toEqual([])
  })

  it("dates a portal-issued dataset and leaves an external accession undated", () => {
    expect(dataset({}, "hum0009.v1.CpG.v1").releaseDate).toBe("2020-01-01")
    expect(dataset({}, "JGAD000009").releaseDate).toBeNull()
    expect(isPortalIssuedId("hum0009.v1.CpG.v1")).toBe(true)
    expect(isPortalIssuedId("E-GEAD-123")).toBe(false)
  })

  it("starts with no file selection, because that is a note a curator makes", () => {
    expect(dataset({}).fileSelection).toEqual([])
  })

  it("splits a cell naming two quantities into the two keys they belong to", () => {
    const content = dataset({
      experiments: [{ data: { Coverage: { ja: { text: "31.8x\n98%" } } } }],
    })
    const byKey = new Map(first(content.experiments).values.map((v) => [v.keyId, v.value]))
    expect(byKey.get("key-coverage-depth")).toMatchObject({
      kind: "number",
      values: { state: "value", value: [{ value: 31.8, unit: "x" }] },
    })
    expect(byKey.get("key-coverage-breadth")).toMatchObject({
      kind: "number",
      values: { state: "value", value: [{ value: 98, unit: "%" }] },
    })
  })

  it("does not count a number in one half's unit as residue of the other half", () => {
    // A bare number read by hand as a depth reaches both halves of the cell.
    const hand = byHand([{ sourceKey: "Coverage", line: "46", read: [{ label: null, value: 46, unit: "x", high: null, note: null }], why: "" }])
    const unread: UnreadLine[] = []
    const content = datasetOf([dumpRow({ experiments: [{ data: { Coverage: { ja: { text: "46" } } } }] }, "JGAD000001", null)], "JGAD000001", undefined, unread, hand)

    expect(unread).toEqual([])
    expect(new Map(first(content.experiments).values.map((v) => [v.keyId, v.value])).get("key-coverage-depth"))
      .toMatchObject({ values: { state: "value", value: [{ value: 46, unit: "x" }] } })
  })

  it("still counts a number in neither half's unit as residue", () => {
    const unread: UnreadLine[] = []
    datasetOf([dumpRow({ experiments: [{ data: { Coverage: { ja: { text: "5 GB" } } } }] }, "JGAD000001", null)], "JGAD000001", undefined, unread)

    expect(unread.length).toBeGreaterThan(0)
  })

  it("sorts a number's label to the side of its own language when no translation is on record", () => {
    const hand = byHand([{
      sourceKey: "Coverage",
      line: "常染色体: 31.8x",
      why: "",
      read: [{ label: "常染色体", value: 31.8, unit: "x", high: null, note: null }],
    }])
    const content = datasetOf(
      [dumpRow({ experiments: [{ data: { Coverage: { ja: { text: "常染色体: 31.8x" } } } }] }, "JGAD000001", null)],
      "JGAD000001",
      undefined,
      [],
      hand,
    )
    const values = new Map(first(content.experiments).values.map((v) => [v.keyId, v.value]))
    expect(values.get("key-coverage-depth")).toMatchObject({
      values: { state: "value", value: [{ label: { ja: "常染色体", en: "" } }] },
    })
  })

  it("takes both sides of a number's label from the hand translation table when one is on record", () => {
    const hand = byHand([{
      sourceKey: "Coverage",
      line: "常染色体: 31.8x",
      why: "",
      read: [{ label: "常染色体", value: 31.8, unit: "x", high: null, note: null }],
    }])
    const table = labelTranslations({ 常染色体: { ja: "常染色体", en: "Autosome" } })
    const content = datasetOf(
      [dumpRow({ experiments: [{ data: { Coverage: { ja: { text: "常染色体: 31.8x" } } } }] }, "JGAD000001", null)],
      "JGAD000001",
      undefined,
      [],
      hand,
      table,
    )
    const values = new Map(first(content.experiments).values.map((v) => [v.keyId, v.value]))
    expect(values.get("key-coverage-depth")).toMatchObject({
      values: { state: "value", value: [{ label: { ja: "常染色体", en: "Autosome" } }] },
    })
  })

  it("reads a width as a value with an upper end, both converted to the canonical unit", () => {
    const content = dataset({
      experiments: [{ data: { "Total Data Volume": { ja: { text: "0.9-1.3 TB" } } } }],
    })
    const [slot] = first(content.experiments).values
    expect(slot?.value).toMatchObject({
      kind: "number",
      values: { state: "value", value: [{ value: 900, high: 1300, unit: "GB" }] },
    })
  })

  it("turns a cell nothing could read into an unknown slot rather than dropping it", () => {
    const content = dataset({
      experiments: [{ data: { "Total Data Volume": { ja: { text: "ご教示ください" } } } }],
    })
    expect(first(content.experiments).values).toEqual([{
      keyId: "key-volume",
      value: { kind: "number", values: { state: "unknown" } },
    }])
  })

  it("leaves no slot at all for an empty cell rather than calling it unknown", () => {
    const content = dataset({
      experiments: [{ data: { "Total Data Volume": { ja: { text: "" } } } }],
    })
    expect(first(content.experiments).values).toEqual([])
  })

  it("makes a cell the article filled with a dash not-applicable, in each language that has it", () => {
    const both = dataset({ experiments: [{ data: { "Materials and Participants": { ja: { text: "-" }, en: { text: "-" } } } }] })
    const one = dataset({ experiments: [{ data: { "Materials and Participants": { ja: { text: "－" }, en: { text: "12 cases" } } } }] })
    const alone = dataset({ experiments: [{ data: { "Materials and Participants": { ja: { text: "-" } } } }] })

    const na = { state: "not-applicable" }
    expect(first(both.experiments).values).toEqual([{ keyId: "key-materials", value: { kind: "text", text: { ja: na, en: na } } }])
    expect(first(one.experiments).values).toEqual([{
      keyId: "key-materials",
      value: { kind: "text", text: { ja: na, en: { state: "value", value: [[{ text: "12 cases" }]] } } },
    }])
    expect(first(alone.experiments).values).toEqual([{ keyId: "key-materials", value: { kind: "text", text: { ja: na, en: na } } }])
  })

  it("makes a number cell with a dash not-applicable rather than a question", () => {
    const unread: UnreadLine[] = []
    const content = datasetOf([dumpRow({ experiments: [{ data: { "Total Data Volume": { ja: { text: "-" }, en: { text: "-" } } } }] }, "JGAD000001", null)], "JGAD000001", undefined, unread)

    expect(first(content.experiments).values).toEqual([{ keyId: "key-volume", value: { kind: "number", values: { state: "not-applicable" } } }])
    expect(unread).toEqual([])
  })

  it("makes a facet whose cell has a dash not-applicable when nothing else gave it a value", () => {
    const dashed = dataset({ experiments: [{ data: { "Experimental Method": { ja: { text: "-" }, en: { text: "-" } } } }] })
    expect(first(dashed.experiments).values).toEqual([{ keyId: "key-method", value: { kind: "vocabulary", termIds: { state: "not-applicable" } } }])
  })

  it("keeps what a cell's readable lines say when its other lines are residue", () => {
    const content = dataset({
      experiments: [{ data: { "Total Data Volume": { ja: { text: "1.5 TB\nご教示ください" } } } }],
    })
    const [slot] = first(content.experiments).values
    expect(slot?.value).toMatchObject({
      kind: "number",
      values: { state: "value", value: [{ value: 1500, unit: "GB" }] },
    })
  })
})

describe("buildCauRows", () => {
  it("gives each entry of a research an id of its own", () => {
    const rows = buildCauRows("hum0001", [
      { name: { en: { text: "A" } } },
      { name: { en: { text: "B" } } },
    ])
    expect(new Set(rows.map((r) => r.applicationId)).size).toBe(2)
    expect(rows.every((r) => r.humLabel === "hum0001")).toBe(true)
  })

  it("turns an empty period into no date rather than an empty string", () => {
    const [row] = buildCauRows("hum0001", [{ periodOfDataUse: { startDate: "", endDate: null } }])
    expect(row?.periodStart).toBeNull()
    expect(row?.periodEnd).toBeNull()
  })
})

describe("a cell holding a table about several datasets", () => {
  const volume = (text: string) => ({
    experiments: [{ data: { "Materials and Participants": { ja: { text }, en: { text } } } }],
  })
  const siblings = [
    dumpRow(volume("JGAD000001: 88 GB\nJGAD000002: 32 GB"), "JGAD000001", null),
    dumpRow(volume("JGAD000001: 88 GB\nJGAD000002: 32 GB"), "JGAD000002", null),
  ]
  const said = (content: ReturnType<typeof datasetOf>) =>
    JSON.stringify(first(first(content.experiments).values).value)

  it("keeps only the lines about the dataset whose cell it is", () => {
    expect(said(datasetOf(siblings, "JGAD000001"))).toContain("88 GB")
    expect(said(datasetOf(siblings, "JGAD000001"))).not.toContain("32 GB")
    expect(said(datasetOf(siblings, "JGAD000002"))).toContain("32 GB")
    expect(said(datasetOf(siblings, "JGAD000002"))).not.toContain("88 GB")
  })

  /**
   * The whole point of dropping a line is that it is written down where it
   * belongs. A line naming a dataset that never states it itself is the only copy there
   * is, and it stays until somebody has looked at it.
   */
  it("keeps a line the dataset it identifies does not have itself", () => {
    const lonely = [
      dumpRow(volume("JGAD000001: 88 GB\nJGAD000009: 32 GB"), "JGAD000001", null),
      dumpRow(volume(""), "JGAD000009", null),
    ]
    expect(said(datasetOf(lonely, "JGAD000001"))).toContain("32 GB")
  })

  it("keeps a line the dataset it identifies disagrees with", () => {
    const differing = [
      dumpRow(volume("JGAD000001: 88 GB\nJGAD000002: 32 GB"), "JGAD000001", null),
      dumpRow(volume("JGAD000002: 33 GB"), "JGAD000002", null),
    ]
    expect(said(datasetOf(differing, "JGAD000001"))).toContain("32 GB")
  })

  it("leaves a line whose label names no dataset at all", () => {
    const plain = [dumpRow(volume("常染色体: 5,961,600\nX染色体: 147,353"), "JGAD000001", null)]
    expect(said(datasetOf(plain, "JGAD000001"))).toContain("5,961,600")
    expect(said(datasetOf(plain, "JGAD000001"))).toContain("147,353")
  })

  it("drops a number's label that is its own dataset in JGA's long form", () => {
    const own = [dumpRow({ experiments: [{ data: { "Total Data Volume": { ja: { text: "JGAD00000000276: 7 TB" } } } }] }, "JGAD000276", null)]
    const held = first(first(datasetOf(own, "JGAD000276").experiments).values).value
    if (held.kind !== "number") throw new Error("expected numbers")
    expect(value(held.values).map((one) => one.label)).toEqual([null])
  })

  it("reads a dataset named in brackets after a caption as the line's dataset", () => {
    const table = "大腸がん(JGAD000001): 150 bp\n肺腺がん(JGAD000002): 100 bp"
    const captioned = [dumpRow(volume(table), "JGAD000001", null), dumpRow(volume(table), "JGAD000002", null)]
    expect(said(datasetOf(captioned, "JGAD000001"))).toContain("150 bp")
    expect(said(datasetOf(captioned, "JGAD000001"))).not.toContain("100 bp")
  })

  it("keeps a line whose brackets name its own dataset beside another", () => {
    const shared = "JGAD000001、JGAD000002: 150 bp\n大腸がん(JGAD000001、JGAD000002): 100 bp"
    const both = [dumpRow(volume(shared), "JGAD000001", null), dumpRow(volume(shared), "JGAD000002", null)]
    expect(said(datasetOf(both, "JGAD000001"))).toContain("150 bp")
    expect(said(datasetOf(both, "JGAD000001"))).toContain("100 bp")
  })

  /** A value has colons of its own, and those are not labels. */
  it("does not read a colon inside brackets as a label", () => {
    const bracketed = [
      dumpRow(volume("JGAD000001: 1.32 TB(bam [ref: hg19])"), "JGAD000001", null),
      dumpRow(volume("JGAD000002: 88 GB"), "JGAD000002", null),
    ]
    expect(said(datasetOf(bracketed, "JGAD000001"))).toContain("hg19")
  })
})

describe("a line headed by the study or dataset it is about", () => {
  const studies = new Map([["JGAS000001", ["JGAD000001"]], ["JGAS000002", ["JGAD000002"]], ["JGAS000009", ["JGAD000001", "JGAD000002"]]])
  const materials = (text: string) => ({ experiments: [{ data: { "Materials and Participants": { ja: { text }, en: { text } } } }] })
  const linesOf = (text: string, label: string) => linesFrom({ JGAD000001: text, JGAD000002: text }, label)
  const linesFrom = (texts: Record<string, string>, label: string) => {
    const all = Object.entries(texts).map(([one, text]) => dumpRow(materials(text), one, null))
    const one = all.find((row) => row.label === label)
    if (one === undefined) throw new Error(`no dataset ${label}`)
    const content = buildDatasetContent({
      dataset: one,
      keyIdByCode: KEY_IDS,
      codeBySourceKey: CODE_BY_SOURCE,
      termIdBySetAndCode: TERM_IDS,
      knownCode: () => false,
      accessCriteriaKeyCode: "access-criteria",
      typeOfDataKeyCode: "type-of-data",
      datasetLabels: new Set(all.map((row) => row.label)),
      ownLines: ownLines(all, undefined, undefined, studies),
      studies,
      unread: [],
      byHand: new Map(),
    })
    const held = first(first(content.experiments).values).value
    if (held.kind !== "text") throw new Error("expected text")
    return value(held.text.ja).map((line) => line.map((span) => span.text).join(""))
  }

  it("keeps only the lines headed by the dataset's own study", () => {
    const text = "【JGAS000001】1症例：腫瘍組織\n【JGAS000002】2症例：正常組織"
    expect(linesOf(text, "JGAD000001")).toEqual(["【JGAS000001】1症例：腫瘍組織"])
    expect(linesOf(text, "JGAD000002")).toEqual(["【JGAS000002】2症例：正常組織"])
  })

  it("reads the English page's square brackets as the heading", () => {
    const text = "[JGAS000001] 1 case: tumor\n[JGAS000002] 2 cases: normal"
    expect(linesOf(text, "JGAD000001")).toEqual(["[JGAS000001] 1 case: tumor"])
  })

  it("does not read a link as a heading, nor its address as naming a dataset", () => {
    const text = "[JGAS000001] 1 case: tumor\n[JGAD000002](https://example.org/JGAD000002) 3 cases: blood"
    expect(linesOf(text, "JGAD000001")).toEqual(["[JGAS000001] 1 case: tumor", "JGAD000002 3 cases: blood"])
  })

  it("reads a study before a colon the same as one in lenticular brackets", () => {
    const text = "JGAS000001：CD19+細胞のRNA\nJGAS000002：Treg細胞のRNA"
    expect(linesOf(text, "JGAD000001")).toEqual(["JGAS000001：CD19+細胞のRNA"])
  })

  it("reads a dataset in lenticular brackets", () => {
    const text = "【JGAD000001】腫瘍組織：22検体\n【JGAD000002】腫瘍組織：4検体"
    expect(linesOf(text, "JGAD000002")).toEqual(["【JGAD000002】腫瘍組織：4検体"])
  })

  it("keeps the group under the dataset's own heading when every heading stands alone on its line", () => {
    const text = "【JGAS000001】\n悪性骨巨細胞腫：1症例\n腫瘍組織：1検体\n【JGAS000002】\n軟骨肉腫：2症例\n腫瘍組織：1検体\n合計：4検体"
    expect(linesOf(text, "JGAD000001")).toEqual(["【JGAS000001】", "悪性骨巨細胞腫：1症例", "腫瘍組織：1検体"])
    expect(linesOf(text, "JGAD000002")).toEqual(["【JGAS000002】", "軟骨肉腫：2症例", "腫瘍組織：1検体", "合計：4検体"])
  })

  it("reads the English page's square brackets alone on a line as a group's heading", () => {
    const text = "[JGAS000001]\nAML: 4 cases\n[JGAS000002]\nAML: 4 cases\nhealthy control: 2 samples"
    expect(linesOf(text, "JGAD000002")).toEqual(["[JGAS000002]", "AML: 4 cases", "healthy control: 2 samples"])
  })

  it("keeps the lines above the first heading alone on its line for every dataset", () => {
    const text = "子宮頸がん\n【JGAS000001】\n腫瘍組織：8検体\n【JGAS000002】\n正常組織：2検体"
    expect(linesOf(text, "JGAD000002")).toEqual(["子宮頸がん", "【JGAS000002】", "正常組織：2検体"])
  })

  it("keeps a group the dataset its heading names does not have itself", () => {
    const texts = {
      JGAD000001: "【JGAS000001】\n腫瘍組織：1検体\n【JGAS000002】\n正常組織：2検体",
      JGAD000002: "【JGAS000001】\n腫瘍組織：1検体\n【JGAS000002】\n正常組織：3検体",
    }
    expect(linesFrom(texts, "JGAD000001")).toEqual(texts.JGAD000001.split("\n"))
    expect(linesFrom(texts, "JGAD000002")).toEqual(["【JGAS000002】", "正常組織：3検体"])
  })

  it("keeps a group whose heading names the dataset beside another", () => {
    const text = "【JGAS000001/JGAD000002】\n腫瘍組織：1検体\n【JGAS000002】\n正常組織：2検体"
    expect(linesOf(text, "JGAD000002")).toEqual(text.split("\n"))
    expect(linesOf(text, "JGAD000001")).toEqual(["【JGAS000001/JGAD000002】", "腫瘍組織：1検体"])
  })

  it("leaves groups under headings alone on their lines whole where none is the dataset's own", () => {
    const text = "【JGAD000002】\nJGAD000001 の vcf\n【JGAS000002】\n正常組織：2検体"
    expect(linesFrom({ JGAD000001: text, JGAD000002: text }, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("leaves a cell whole where one heading stands alone and another has words after it", () => {
    const text = "【JGAS000001】\n腫瘍組織：1検体\n【JGAS000002】正常組織：2検体"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("does not read a heading alone on its line that names no dataset as a group", () => {
    const text = "【WGS】\n1,026名\n【reference panel】\n2,504名"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("leaves a cell whole where a heading has lines under it that are not headed", () => {
    const text = "【JGAS000001】寒冷凝集素症：1症例\n頬粘膜：1検体\n【JGAS000002】寒冷凝集素症：1症例\n頬粘膜：2検体"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("leaves a cell whole where a caption heads a later group", () => {
    const text = "子宮頸がん\n【JGAS000001】4症例：腫瘍組織\n\nNIKS18細胞株\n【JGAS000002】siNPM3：2検体"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("leaves a cell whole where a note follows a heading", () => {
    const text = "【JGAS000001】腫瘍組織：2検体※\n※EM-seqと同じ組織由来\n【JGAS000002】正常組織：1検体"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("leaves a cell whole where no heading is the dataset's own", () => {
    const text = "【JGAS000002】2症例：正常組織\n【JGAS000002】3症例：腫瘍組織"
    expect(linesOf(text, "JGAD000001")).toEqual(text.split("\n"))
  })

  it("divides a line naming its dataset directly beside the study as before, whatever else the cell holds", () => {
    const text = "【オルガノイド】\nJGAS000001/JGAD000001：21症例\nJGAS000002/JGAD000002：27症例\n（v4に正常肺オルガノイド含む）"
    expect(linesOf(text, "JGAD000001")).toEqual(["【オルガノイド】", "JGAS000001/JGAD000001：21症例", "（v4に正常肺オルガノイド含む）"])
  })

  it("keeps the lines above the first heading for every dataset", () => {
    const text = "子宮頸がん（ICD10：C539）\n【JGAS000001】4症例：腫瘍組織\n【JGAS000002】1症例：オルガノイド"
    expect(linesOf(text, "JGAD000002")).toEqual(["子宮頸がん（ICD10：C539）", "【JGAS000002】1症例：オルガノイド"])
  })

  it("leaves a line headed by no study or dataset, or by a study of both", () => {
    const text = "【GWAS集計情報】要約統計量\n【JGAS000009】共通の対照群：100名"
    expect(linesOf(text, "JGAD000001")).toEqual(["【GWAS集計情報】要約統計量", "【JGAS000009】共通の対照群：100名"])
  })
})

/**
 * A reader that recovers line breaks v1's text lost: here, each `|` of the
 * stored text is a break the source had, and a `~` a paragraph break.
 */
const recovering: ProseReader = (value) => (value?.text ?? "")
  .split(/[|\n]/)
  .map((line) => (line === "~" ? [] : [{ text: line }]))

describe("a cell read by the load's own reader", () => {
  const cell = (text: string) => ({
    experiments: [{ data: { "Materials and Participants": { ja: { text }, en: { text } } } }],
  })
  const lines = (content: ReturnType<typeof datasetOf>) => {
    const held = first(first(content.experiments).values).value
    if (held.kind !== "text") throw new Error("expected text")
    return value(held.text.ja).map((line) => line.map((span) => span.text).join(""))
  }

  it("keeps the breaks the reader finds", () => {
    const one = [dumpRow(cell("healthy adults|Japanese"), "JGAD000001", null)]
    expect(lines(datasetOf(one, "JGAD000001", recovering))).toEqual(["healthy adults", "Japanese"])
  })

  it("drops a line about a sibling when the sibling has the same line, reading both through the reader", () => {
    const table = "JGAD000001: 88 GB|JGAD000002: 32 GB"
    const siblings = [dumpRow(cell(table), "JGAD000001", null), dumpRow(cell(table), "JGAD000002", null)]
    expect(lines(datasetOf(siblings, "JGAD000001", recovering))).toEqual(["JGAD000001: 88 GB"])
    expect(lines(datasetOf(siblings, "JGAD000002", recovering))).toEqual(["JGAD000002: 32 GB"])
  })

  it("leaves no paragraph break doubled or at an edge after a line is dropped", () => {
    const table = "~|JGAD000002: 32 GB|~|JGAD000001: 88 GB|~|~|JGAD000002: 1 GB|~"
    const siblings = [
      dumpRow(cell(table), "JGAD000001", null),
      dumpRow(cell("JGAD000002: 32 GB|JGAD000002: 1 GB"), "JGAD000002", null),
    ]
    expect(lines(datasetOf(siblings, "JGAD000001", recovering))).toEqual(["JGAD000001: 88 GB"])
  })

  it("keeps a paragraph break between two lines that stay", () => {
    const one = [dumpRow(cell("first|~|second"), "JGAD000001", null)]
    expect(lines(datasetOf(one, "JGAD000001", recovering))).toEqual(["first", "", "second"])
  })

  it("drops a sibling's line from a number cell when the reader writes the sibling's own line in full-width forms", () => {
    const table = "JGAD000001: 88 GB(fastq)\nJGAD000002: 32 GB(fastq)"
    const volume = { experiments: [{ data: { "Total Data Volume": { ja: { text: table }, en: { text: table } } } }] }
    const siblings = [dumpRow(volume, "JGAD000001", null), dumpRow(volume, "JGAD000002", null)]
    const fullWidth: ProseReader = (value, lang) => (value?.text ?? "").split("\n")
      .map((line) => [{ text: lang === "ja" ? line.replace(": ", "：").replace("(", "（").replace(")", "）") : line }])
    const volumes = (label: string) => {
      const held = first(first(datasetOf(siblings, label, fullWidth).experiments).values).value
      if (held.kind !== "number") throw new Error("expected numbers")
      return value(held.values).map((one) => one.value)
    }

    expect(volumes("JGAD000001")).toEqual([88])
    expect(volumes("JGAD000002")).toEqual([32])
  })

  it("reads each dataset's lines with the reader given for it", () => {
    const table = "JGAD000001: 88 GB|JGAD000002: 32 GB"
    const siblings = [dumpRow(cell(table), "JGAD000001", null), dumpRow(cell(table), "JGAD000002", null)]
    const readFor = (one: PublishedDataset): ProseReader => (one.label === "JGAD000002" ? recovering : (value) => [[{ text: value?.text ?? "" }]])

    const keys = [...ownLines(siblings, undefined, readFor)]

    // JGAD000001's reader keeps the cell one line; JGAD000002's reads each row as a line.
    expect(keys.filter((key) => key.startsWith("JGAD000001")).map((key) => key.endsWith("88GB|JGAD000002:32GB"))).toEqual([true, true])
    expect(keys.filter((key) => key.startsWith("JGAD000002")).map((key) => key.endsWith("32GB") && !key.includes("88GB"))).toEqual([true, true])
  })
})

describe("the type of data", () => {
  const typed = (readTypeOfData?: (text: string, lang: "ja" | "en") => ReturnType<ProseReader>) => {
    const one = dumpRow({ typeOfData: { ja: "NGS(Exome) SNP-chip", en: "NGS (Exome) SNP-chip" } }, "JGAD000001", null)
    const content = buildDatasetContent({
      dataset: one,
      keyIdByCode: KEY_IDS,
      codeBySourceKey: CODE_BY_SOURCE,
      termIdBySetAndCode: TERM_IDS,
      knownCode: () => false,
      accessCriteriaKeyCode: "access-criteria",
      typeOfDataKeyCode: "type-of-data",
      datasetLabels: new Set([one.label]),
      ownLines: new Set(),
      unread: [],
      byHand: new Map(),
      readTypeOfData,
    })
    return content.values.find((slot) => slot.keyId === "key-type")?.value
  }

  it("is the string v1 stored, read as it is, without a reader", () => {
    expect(typed()).toEqual({ kind: "text", text: { ja: filled([[{ text: "NGS(Exome) SNP-chip" }]]), en: filled([[{ text: "NGS (Exome) SNP-chip" }]]) } })
  })

  it("is what the reader makes of the string, in each language", () => {
    const read = (text: string, lang: "ja" | "en") => (lang === "ja" ? [[{ text: "NGS（Exome）" }], [{ text: "SNP-chip" }]] : [[{ text }]])

    expect(typed(read)).toEqual({ kind: "text", text: {
      ja: filled([[{ text: "NGS（Exome）" }], [{ text: "SNP-chip" }]]),
      en: filled([[{ text: "NGS (Exome) SNP-chip" }]]),
    } })
  })
})

describe("the disease of one row of a disease-by-disease table", () => {
  const disease = (nameJa: string, nameEn: string) => ({ termIds: [nameEn], nameJa, nameEn })
  const slot = (...diseases: ReturnType<typeof disease>[]): ValueSlot => ({ keyId: "k", value: { kind: "disease", diseases: { state: "value", value: diseases } } })
  const table = (label: string): EsExperiment => ({
    data: {
      "NBDC Dataset Accession": {
        ja: { text: `心不全＊\n[${label}](/files/hum0014/${label}.zip)\n[Dictionary file](/files/x.txt)`, rawHtml: null },
        en: { text: `Heart failure*\n[${label}](/files/hum0014/${label}.zip)`, rawHtml: null },
      },
    },
  })

  it("reads the caption above the dataset's own link, in each language", () => {
    expect(captionOf(table("hum0014.v17.HF.v1"), "hum0014.v17.HF.v1")).toEqual({ ja: "心不全＊", en: "Heart failure*" })
  })

  it("reads no caption where the line above is a link or there is none", () => {
    const linkAbove: EsExperiment = { data: { "NBDC Dataset Accession": { ja: { text: "[a](/files/a.zip)\n[b](/files/b.zip)", rawHtml: null } } } }

    expect(captionOf(linkAbove, "b")).toEqual({ ja: null, en: null })
    expect(captionOf({ data: {} }, "b")).toEqual({ ja: null, en: null })
  })

  it("keeps only the disease the caption names, marks and spacing aside", () => {
    const slots = [slot(disease("不整脈", "Cardiac arrhythmia"), disease("心不全", "heart failure"))]

    expect(narrowedToCaption(slots, { ja: "心不全＊", en: null })).toEqual([slot(disease("心不全", "heart failure"))])
    expect(narrowedToCaption(slots, { ja: null, en: "Heart Failure *" })).toEqual([slot(disease("心不全", "heart failure"))])
  })

  it("keeps every disease when the caption names none of them, or there is no caption", () => {
    const slots = [slot(disease("不整脈", "Cardiac arrhythmia"))]

    expect(narrowedToCaption(slots, { ja: "総コレステロール", en: null })).toEqual(slots)
    expect(narrowedToCaption(slots, { ja: null, en: null })).toBe(slots)
  })
})
