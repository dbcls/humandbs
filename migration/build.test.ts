import { describe, expect, it } from "vitest"

import { isPortalIssuedId } from "~/admin/labels"
import { filled } from "~/content/empty"
import type { Slot } from "~/content/types"

import { buildCauRows, buildDatasetContent, buildResearchContent, ownLines, type ProseReader } from "./build"
import type { EsDataset, EsResearchVersion, PublishedDataset } from "./es"
import { byHand, type ReadNumber } from "./numbers"

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
])
const CODE_BY_SOURCE = new Map([
  ["Materials and Participants", "materials-and-participants"],
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
    expect(first(content.relatedPublications).datasetIds).toEqual(["identity-1"])
    // Not in the ledger, but shaped as an accession: kept as the ID.
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
    expect(first(content.relatedPublications).datasetIds).toEqual(["identity-1"])
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
    expect(first(content.relatedPublications).datasetIds).toEqual(["identity-12"])
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
   * belongs. A line naming a dataset that never says it is the only copy there
   * is, and it stays until somebody has looked at it.
   */
  it("keeps a line the dataset it names does not carry itself", () => {
    const lonely = [
      dumpRow(volume("JGAD000001: 88 GB\nJGAD000009: 32 GB"), "JGAD000001", null),
      dumpRow(volume(""), "JGAD000009", null),
    ]
    expect(said(datasetOf(lonely, "JGAD000001"))).toContain("32 GB")
  })

  it("keeps a line the dataset it names disagrees with", () => {
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

  /** A value carries colons of its own, and those are not labels. */
  it("does not read a colon inside brackets as a label", () => {
    const bracketed = [
      dumpRow(volume("JGAD000001: 1.32 TB(bam [ref: hg19])"), "JGAD000001", null),
      dumpRow(volume("JGAD000002: 88 GB"), "JGAD000002", null),
    ]
    expect(said(datasetOf(bracketed, "JGAD000001"))).toContain("hg19")
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

  it("drops a line about a sibling when the sibling says it, reading both through the reader", () => {
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
})
