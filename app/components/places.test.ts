import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInput } from "~/admin/dataset-form"
import { researchContentInput } from "~/admin/form"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { CommentAnchor, ResearchContent } from "~/content/types"

import { PLACE_SEPARATOR, placeExperiments, placeName, placeRows, placeSegments, type PlaceSources } from "./places"

const research = (path: string): CommentAnchor => ({ kind: "research-field", path })
const dataset = (datasetId: string, path: string): CommentAnchor => ({ kind: "dataset-field", datasetId, path })

function sources(over: Partial<PlaceSources> = {}): PlaceSources {
  return {
    humLabel: "hum0034",
    rows: {
      "dataProviders": [{ id: "p1", first: "山田 太郎" }, { id: "p2", first: "" }],
      "researchProjects": [{ id: "r1", first: "難聴プロジェクト" }],
      "grants": [{ id: "g1", first: "日本医療研究開発機構 (AMED) 難治性疾患" }, { id: "g2", first: "日本医療研究開発機構 (AMED) 臨床ゲノム" }],
      "relatedPublications": [{ id: "a1", first: "Genome-wide" }],
      "listingSummary.dataProviders": [{ id: "l1", first: "山田 太郎" }],
    },
    datasets: [
      { id: "d1", label: "JGAD000001", number: 1 },
      { id: "d2", label: null, number: 3 },
      { id: "d3", label: null, number: null },
    ],
    experiments: { d1: [{ id: "e1", name: "RNA-seq" }, { id: "e2", name: "" }] },
    keyLabels: { k1: "データの種類", k2: "プラットフォーム" },
    ...over,
  }
}

const name = (anchor: CommentAnchor, over: Partial<PlaceSources> = {}) => placeName(anchor, sources(over), "ja")

describe("the name of a place in the research content", () => {
  it("starts from the hum ID and runs from the section down to the place", () => {
    expect(name(research("title"))).toBe("hum0034 / 研究題目")
    expect(name(research("summary.aims"))).toBe("hum0034 / 研究概要 / 目的")
    expect(name(research("summary.url"))).toBe("hum0034 / 研究概要 / URL")
    expect(name(research("summary"))).toBe("hum0034 / 研究概要")
  })

  it("names the dataset section by its heading, not by its path", () => {
    expect(name(research("datasetIds"))).toBe("hum0034 / データセット")
  })

  it("names a row by its number and its first column", () => {
    expect(name(research("dataProviders"))).toBe("hum0034 / 提供者")
    expect(name(research("dataProviders.p1"))).toBe("hum0034 / 提供者 / 行1 (山田 太郎)")
    expect(name(research("dataProviders.p1.name"))).toBe("hum0034 / 提供者 / 行1 (山田 太郎) / 研究代表者")
    expect(name(research("dataProviders.p1.organization.name"))).toBe("hum0034 / 提供者 / 行1 (山田 太郎) / 所属機関")
    expect(name(research("researchProjects.r1.url"))).toBe("hum0034 / 研究プロジェクト情報 / 行1 (難聴プロジェクト) / URL")
    expect(name(research("relatedPublications.a1.doi"))).toBe("hum0034 / 関連論文 / 行1 (Genome-wid…) / DOI")
  })

  it("tells two rows that begin alike apart by their numbers", () => {
    expect(name(research("grants.g1.grantIds"))).toBe("hum0034 / 助成金情報 / 行1 (日本医療研究開発機構…) / 研究課題番号")
    expect(name(research("grants.g2.grantIds"))).toBe("hum0034 / 助成金情報 / 行2 (日本医療研究開発機構…) / 研究課題番号")
  })

  it("shows 未入力 for a row whose first column is empty", () => {
    expect(name(research("dataProviders.p2.organization.name"))).toBe("hum0034 / 提供者 / 行2 (未入力) / 所属機関")
  })

  it("cuts the first column after ten characters, and not at ten", () => {
    const rows = (first: string) => ({ ...sources().rows, dataProviders: [{ id: "p1", first }] })
    expect(name(research("dataProviders.p1"), { rows: rows("1234567890") })).toBe("hum0034 / 提供者 / 行1 (1234567890)")
    expect(name(research("dataProviders.p1"), { rows: rows("12345678901") })).toBe("hum0034 / 提供者 / 行1 (1234567890…)")
    // Characters as a reader counts them, not UTF-16 units: one outside the BMP is one.
    expect(name(research("dataProviders.p1"), { rows: rows("𠮷".repeat(11)) })).toBe(`hum0034 / 提供者 / 行1 (${"𠮷".repeat(10)}…)`)
  })

  it("shows 削除済み for a row that is no longer in the list", () => {
    expect(name(research("dataProviders.gone.name"))).toBe("hum0034 / 提供者 / 削除済み / 研究代表者")
  })

  it("keeps the listing row's own section apart from the research's providers", () => {
    expect(name(research("listingSummary"))).toBe("hum0034 / 研究一覧の行")
    expect(name(research("listingSummary.methods"))).toBe("hum0034 / 研究一覧の行 / 解析手法")
    expect(name(research("listingSummary.dataProviders"))).toBe("hum0034 / 研究一覧の行 / 提供者")
    expect(name(research("listingSummary.dataProviders.l1.name"))).toBe("hum0034 / 研究一覧の行 / 提供者 / 行1 (山田 太郎)")
  })

  it("starts from 研究 (ID 未発行) while the research has no hum ID", () => {
    expect(name(research("title"), { humLabel: null })).toBe("研究 (ID 未発行) / 研究題目")
  })
})

describe("the name of a place in a dataset", () => {
  it("starts from the dataset ID and runs down to the item", () => {
    expect(name(dataset("d1", "values.k1"))).toBe("JGAD000001 / データの種類")
    expect(name(dataset("d1", "fileSelection"))).toBe("JGAD000001 / ファイル")
    expect(name(dataset("d1", "experiments"))).toBe("JGAD000001 / 解析手法")
    expect(name(dataset("d1", "experiments.e1.values.k2"))).toBe("JGAD000001 / 解析手法 1 (RNA-seq) / プラットフォーム")
  })

  it("tells experiments with the same name apart by their numbers", () => {
    const experiments = { d1: [{ id: "e1", name: "WES" }, { id: "e2", name: "WES" }] }
    expect(name(dataset("d1", "experiments.e1.values.k2"), { experiments })).toBe("JGAD000001 / 解析手法 1 (WES) / プラットフォーム")
    expect(name(dataset("d1", "experiments.e2.values.k2"), { experiments })).toBe("JGAD000001 / 解析手法 2 (WES) / プラットフォーム")
  })

  it("cuts an experiment's name after ten characters", () => {
    const experiments = { d1: [{ id: "e1", name: "Whole exome sequencing" }] }
    expect(name(dataset("d1", "experiments.e1"), { experiments })).toBe("JGAD000001 / 解析手法 1 (Whole exom…)")
  })

  it("names a comment on an experiment's name as the experiment itself", () => {
    expect(name(dataset("d1", "experiments.e1.label"))).toBe("JGAD000001 / 解析手法 1 (RNA-seq)")
    expect(name(dataset("d1", "experiments.e1"))).toBe("JGAD000001 / 解析手法 1 (RNA-seq)")
  })

  it("shows 未入力 for an experiment with no name, and 削除済み for one that is gone", () => {
    expect(name(dataset("d1", "experiments.e2.values.k2"))).toBe("JGAD000001 / 解析手法 2 (未入力) / プラットフォーム")
    expect(name(dataset("d1", "experiments.gone.values.k2"))).toBe("JGAD000001 / 解析手法 (削除済み) / プラットフォーム")
  })

  it("names a dataset with no ID by its row in the research's dataset table", () => {
    expect(name(dataset("d2", "values.k1"))).toBe("データセット ID 3 (ID 未発行) / データの種類")
    expect(name(dataset("d3", "values.k1"))).toBe("データセット (ID 未発行) / データの種類")
  })

  it("shows データセット (削除済み) for a dataset the research no longer has", () => {
    expect(name(dataset("gone", "values.k1"))).toBe("データセット (削除済み) / データの種類")
  })

  it("falls back to 項目 for a key the catalog no longer has", () => {
    expect(name(dataset("d1", "values.unknown"))).toBe("JGAD000001 / 項目")
  })
})

describe("the name of a comment on the whole", () => {
  it("is 全体へのコメント", () => {
    expect(name({ kind: "draft" })).toBe("全体へのコメント")
  })
})

describe("what names the rows and experiments", () => {
  it("reads each table's first column as the editor's table shows it", () => {
    const content: ResearchContent = {
      ...emptyResearchContent(),
      dataProviders: [
        { id: "p1", name: { ja: filled("山田 太郎"), en: filled("Taro Yamada") }, organization: { name: { ja: filled(""), en: filled("") } } },
        { id: "p2", name: { ja: filled(""), en: filled("Hanako Sato") }, organization: { name: { ja: filled(""), en: filled("") } } },
        { id: "p3", name: { ja: { state: "unknown" }, en: { state: "unknown" } }, organization: { name: { ja: filled(""), en: filled("") } } },
      ],
    }
    expect(placeRows(researchContentInput(content), "ja").dataProviders).toEqual([
      { id: "p1", first: "山田 太郎" },
      // The English side while the Japanese side is empty, as the table shows it.
      { id: "p2", first: "Hanako Sato" },
      // The word for the state, as the table shows it.
      { id: "p3", first: "未確定" },
    ])
  })

  it("reads an experiment's name, and nothing for one not given as a value", () => {
    const content = {
      ...emptyDatasetContent(),
      experiments: [
        { id: "e1", label: filled("RNA-seq"), values: [] },
        { id: "e2", label: { state: "unknown" as const }, values: [] },
      ],
    }
    expect(placeExperiments(datasetContentInput(content))).toEqual([{ id: "e1", name: "RNA-seq" }, { id: "e2", name: "" }])
  })
})

describe("any place's name", () => {
  const segment = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/)
  const anyPath = fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join("."))
  const anyAnchor = fc.oneof(
    anyPath.map(research),
    fc.tuple(fc.constantFrom("d1", "d2", "d3", "d4"), anyPath).map(([id, path]) => dataset(id, path)),
  )

  it("starts from the research or the dataset, and has no empty segment", () => {
    fc.assert(fc.property(anyAnchor, (anchor) => {
      const segments = placeSegments(anchor, sources(), "ja")
      expect(segments.length).toBeGreaterThan(1)
      expect(segments.every((one) => one.trim() !== "")).toBe(true)
      expect(placeName(anchor, sources(), "ja").split(PLACE_SEPARATOR)[0]).toBe(segments[0])
    }))
  })

  it("never shows the identity of a row, an experiment or a catalog key", () => {
    const ids = ["p1", "p2", "r1", "g1", "g2", "a1", "l1", "e1", "e2", "k1", "k2"]
    const known = fc.constantFrom(
      "dataProviders.p1.name", "dataProviders.p2.organization.name", "researchProjects.r1.url", "grants.g1.title",
      "grants.g2.grantIds", "relatedPublications.a1.doi", "listingSummary.dataProviders.l1.name",
    )
    fc.assert(fc.property(known, (path) => {
      const segments = placeSegments(research(path), sources(), "ja")
      expect(segments.filter((one) => ids.includes(one))).toEqual([])
    }))
    for (const path of ["values.k1", "experiments.e1.values.k2", "experiments.e2.label"]) {
      const segments = placeSegments(dataset("d1", path), sources(), "ja")
      expect(segments.filter((one) => ids.includes(one))).toEqual([])
    }
  })
})
