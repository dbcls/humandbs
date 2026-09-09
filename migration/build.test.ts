import { describe, expect, it } from "vitest"

import { isPortalIssuedId } from "~/admin/labels"
import { filled } from "~/content/empty"
import type { Slot } from "~/content/types"

import { buildCauRows, buildDatasetContent, buildResearchContent, ownLines } from "./build"
import type { EsDataset, EsResearchVersion, PublishedDataset } from "./es"

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
])
const CODE_BY_SOURCE = new Map([["Materials and Participants", "materials-and-participants"]])
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
function datasetOf(all: readonly PublishedDataset[], label: string) {
  const one = all.find((row) => row.label === label)
  if (one === undefined) throw new Error(`no dataset ${label}`)
  return buildDatasetContent({
    dataset: one,
    keyIdByCode: KEY_IDS,
    codeBySourceKey: CODE_BY_SOURCE,
    termIdBySetAndCode: TERM_IDS,
    accessCriteriaKeyCode: "access-criteria",
    typeOfDataKeyCode: "type-of-data",
    datasetLabels: new Set(all.map((row) => row.label)),
    ownLines: ownLines(all),
    unread: [],
    byHand: new Map(),
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
