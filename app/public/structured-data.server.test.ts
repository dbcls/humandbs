import { describe, expect, it } from "vitest"

import { seoMeta } from "./seo"
import { datasetSeo, researchSeo, researchVersionSeo } from "./structured-data.server"
import type { DatasetView, FieldView, ResearchView } from "./view.server"

const ORIGIN = "https://humandbs.example.org"

const plain = (text: string): FieldView => ({ state: "plain", text, untranslated: false })
const UNSETTLED: FieldView = { state: "unsettled" }
const NOT_APPLICABLE: FieldView = { state: "not-applicable" }

function research(over: Partial<ResearchView> = {}): ResearchView {
  return {
    humLabel: "hum0001",
    versionNumber: 3,
    versionLabel: "hum0001-v3",
    releaseDate: "2026-09-01",
    isLatest: true,
    latestVersionNumber: 3,
    untranslated: false,
    title: plain("脳腫瘍のゲノム解析"),
    releaseNote: NOT_APPLICABLE,
    summary: { aims: plain("目的の文。"), methods: NOT_APPLICABLE, targets: NOT_APPLICABLE, links: { state: "value", value: [], untranslated: false } },
    datasets: [],
    dataProviders: [],
    researchProjects: [],
    grants: [],
    relatedPublications: [],
    cau: [],
    files: { rows: [], total: 0, page: 1, pageCount: 1, size: 20, rangeFrom: 0, rangeTo: 0 },
    ...over,
  }
}

function dataset(over: Partial<DatasetView> = {}): DatasetView {
  return {
    label: "JGAD000004",
    humLabel: "hum0006",
    studyAccession: null,
    secondaryLabels: [],
    datePublished: "2020-09-28",
    dateModified: null,
    accessType: { code: "controlled-access-type-1", label: "制限公開 (Type I)", maker: null },
    typeOfData: plain("NGS (Exome)"),
    dataVolume: 403_000_000_000,
    fileFormats: ["BAM"],
    awaited: [],
    untranslated: false,
    experiments: [{ id: "e1", label: plain("WES"), values: [] }, { id: "e2", label: plain("WES"), values: [] }],
    chipHeadings: {},
    files: { rows: [], total: 0, page: 1, pageCount: 1, size: 20, rangeFrom: 0, rangeTo: 0 },
    namedFiles: [],
    ...over,
  }
}

describe("researchSeo", () => {
  it("研究のページを、題目・目的・研究 ID・バージョン・公開日の Dataset として書く", () => {
    const seo = researchSeo(research(), { origin: ORIGIN, locale: "ja" })
    expect(seo.url).toBe(`${ORIGIN}/research/hum0001`)
    expect(seo.description).toBe("目的の文。")
    expect(seo.jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": `${ORIGIN}/research/hum0001`,
      "name": "脳腫瘍のゲノム解析",
      "description": "目的の文。",
      "identifier": "hum0001",
      "inLanguage": "ja",
      "version": "3",
      "datePublished": "2026-09-01",
      "includedInDataCatalog": { "@type": "DataCatalog", "name": "NBDC ヒトデータベース", "url": `${ORIGIN}/` },
    })
  })

  it("英語のページは英語のアドレスで書く", () => {
    const seo = researchSeo(research(), { origin: ORIGIN, locale: "en" })
    expect([seo.url, seo.jsonLd.inLanguage]).toEqual([`${ORIGIN}/en/research/hum0001`, "en"])
  })

  it("目的が未確定なら説明文は題目で、題目も無ければ研究 ID", () => {
    expect(researchSeo(research({ summary: { ...research().summary, aims: UNSETTLED } }), { origin: ORIGIN, locale: "ja" }).description)
      .toBe("脳腫瘍のゲノム解析")
    expect(researchSeo(research({ title: UNSETTLED, summary: { ...research().summary, aims: UNSETTLED } }), { origin: ORIGIN, locale: "ja" }).jsonLd.name)
      .toBe("hum0001")
  })

  it("説明文は 200 字で切って … を付け、JSON-LD の説明文は切らない", () => {
    const long = "あ".repeat(250)
    const seo = researchSeo(research({ summary: { ...research().summary, aims: plain(long) } }), { origin: ORIGIN, locale: "ja" })
    expect(Array.from(seo.description)).toHaveLength(200)
    expect(seo.description.endsWith("…")).toBe(true)
    expect(seo.jsonLd.description).toBe(long)
  })

  it("提供者は研究代表者を所属付きの Person に、代表者が未確定なら所属を Organization にし、どちらも無ければ書かない", () => {
    const seo = researchSeo(research({
      dataProviders: [
        { id: "p1", principalInvestigator: plain("斉藤 延人"), organization: plain("東京大学") },
        { id: "p2", principalInvestigator: UNSETTLED, organization: plain("京都大学") },
        { id: "p3", principalInvestigator: NOT_APPLICABLE, organization: UNSETTLED },
      ],
    }), { origin: ORIGIN, locale: "ja" })
    expect(seo.jsonLd.creator).toEqual([
      { "@type": "Person", "name": "斉藤 延人", "affiliation": { "@type": "Organization", "name": "東京大学" } },
      { "@type": "Organization", "name": "京都大学" },
    ])
  })

  it("助成の機関は 1 度ずつ、関連論文は DOI をアドレスにし、DOI が無ければ題名", () => {
    const grant = (agency: FieldView) => ({ id: "g", title: NOT_APPLICABLE, agency, grantIds: { state: "not-applicable" } as const })
    const publication = (title: string, doi: FieldView) => ({ id: title, title: plain(title), doi, datasetLabels: { state: "not-applicable" } as const, datasets: [] })
    const seo = researchSeo(research({
      grants: [grant(plain("AMED")), grant(plain("AMED")), grant(UNSETTLED)],
      relatedPublications: [
        publication("A", plain("10.1126/science.1239947")),
        publication("B", plain("https://doi.org/10.1/x")),
        publication("C", NOT_APPLICABLE),
      ],
    }), { origin: ORIGIN, locale: "ja" })
    expect(seo.jsonLd.funder).toEqual([{ "@type": "Organization", "name": "AMED" }])
    expect(seo.jsonLd.citation).toEqual(["https://doi.org/10.1126/science.1239947", "https://doi.org/10.1/x", "C"])
  })

  it("値の無い項目はキーごと書かない", () => {
    const keys = Object.keys(researchSeo(research(), { origin: ORIGIN, locale: "ja" }).jsonLd)
    for (const key of ["creator", "funder", "citation", "hasPart"]) expect(keys).not.toContain(key)
  })

  it("配下のデータセットを、それぞれのページのアドレスで並べる", () => {
    const row = { id: null, label: "JGAD000001", accessType: null, typeOfData: null, experimentLabels: [], datePublished: null }
    const seo = researchSeo(research({ datasets: [row] }), { origin: ORIGIN, locale: "en" })
    expect(seo.jsonLd.hasPart).toEqual([{
      "@type": "Dataset",
      "@id": `${ORIGIN}/en/dataset/JGAD000001`,
      "url": `${ORIGIN}/en/dataset/JGAD000001`,
      "identifier": "JGAD000001",
      "name": "JGAD000001",
    }])
  })
})

describe("researchVersionSeo", () => {
  it("そのバージョンのアドレスと説明文だけを書き、JSON-LD は書かない", () => {
    const seo = researchVersionSeo(research({ versionNumber: 2 }), { origin: ORIGIN, locale: "ja" })
    expect(seo.url).toBe(`${ORIGIN}/research/hum0001/v2`)
    expect(seo.description).toBe("目的の文。")
    expect(seo.jsonLd).toBeNull()
  })

  it("英語のページは英語のアドレスで書く", () => {
    const seo = researchVersionSeo(research({ versionNumber: 2 }), { origin: ORIGIN, locale: "en" })
    expect(seo.url).toBe(`${ORIGIN}/en/research/hum0001/v2`)
  })
})

describe("datasetSeo", () => {
  it("説明文は、どの研究のデータセットかと、データの種類・解析手法・アクセス制限をページの言語で並べる", () => {
    expect(datasetSeo(dataset(), { origin: ORIGIN, locale: "ja" }).description)
      .toBe("JGAD000004 (研究 hum0006)。データの種類: NGS (Exome)。解析手法: WES。アクセス制限: 制限公開 (Type I)。")
    expect(datasetSeo(dataset({ accessType: null, experiments: [] }), { origin: ORIGIN, locale: "en" }).description)
      .toBe("JGAD000004 (Research hum0006). Type of data: NGS (Exome).")
  })

  it("データセットを、ID と Secondary ID・所属する研究・総データ量・ファイル形式の Dataset として書く", () => {
    const seo = datasetSeo(dataset({ secondaryLabels: ["JGAD000004-old"] }), { origin: ORIGIN, locale: "ja" })
    expect(seo.jsonLd).toMatchObject({
      "@id": `${ORIGIN}/dataset/JGAD000004`,
      "name": "JGAD000004: NGS (Exome)",
      "identifier": ["JGAD000004", "JGAD000004-old"],
      "isPartOf": { "@type": "Dataset", "@id": `${ORIGIN}/research/hum0006`, "url": `${ORIGIN}/research/hum0006`, "identifier": "hum0006" },
      "datePublished": "2020-09-28",
      "conditionsOfAccess": "制限公開 (Type I)",
      "measurementTechnique": ["WES"],
      "contentSize": "403 GB",
      "encodingFormat": ["BAM"],
    })
    expect(seo.jsonLd).not.toHaveProperty("dateModified")
  })

  it("データの種類が無ければ名前は ID だけで、大きさと形式が無ければキーごと書かない", () => {
    const seo = datasetSeo(dataset({ typeOfData: UNSETTLED, dataVolume: null, fileFormats: [] }), { origin: ORIGIN, locale: "ja" })
    expect(seo.jsonLd.name).toBe("JGAD000004")
    expect(seo.jsonLd).not.toHaveProperty("contentSize")
    expect(seo.jsonLd).not.toHaveProperty("encodingFormat")
  })

  it("非制限公開のファイルは 100 件まではそれぞれを、超えるとアドレスの一覧をダウンロード先にする", () => {
    const rows = (count: number) => Array.from({ length: count }, (_, at) => ({ name: `f${String(at)}.txt`, size: 1_500, isPublic: true, label: "" }))
    // The page holds one page of them; the structured data names every one while there are few enough.
    const files = (count: number) => ({
      files: { rows: rows(count).slice(0, 20), total: count, page: 1, pageCount: Math.ceil(count / 20), size: 20 as const, rangeFrom: 1, rangeTo: Math.min(count, 20) },
      namedFiles: count > 100 ? null : rows(count),
    })
    const few = datasetSeo(dataset({ label: "NHA000001", humLabel: "hum0014", ...files(100) }), { origin: ORIGIN, locale: "ja" })
    expect(few.jsonLd.distribution).toHaveLength(100)
    expect((few.jsonLd.distribution as unknown[])[0]).toEqual({
      "@type": "DataDownload", "name": "f0.txt", "contentUrl": `${ORIGIN}/files/hum0014/f0.txt`, "contentSize": "1.5 KB",
    })
    const many = datasetSeo(dataset({ label: "NHA000001", humLabel: "hum0014", ...files(101) }), { origin: ORIGIN, locale: "ja" })
    expect(many.jsonLd.distribution).toEqual([{ "@type": "DataDownload", "contentUrl": `${ORIGIN}/dataset/NHA000001/files.txt`, "encodingFormat": "text/plain" }])
    expect(datasetSeo(dataset(), { origin: ORIGIN, locale: "ja" }).jsonLd).not.toHaveProperty("distribution")
  })

  it("データの種類が複数あれば、説明文と名前ではページの言語の区切りでつなぐ", () => {
    const typeOfData: FieldView = { state: "rich", text: [[{ text: "NGS (PBAT-seq)" }], [{ text: "NGS (ChIP-seq)" }]], untranslated: false }
    const ja = datasetSeo(dataset({ typeOfData, accessType: null, experiments: [] }), { origin: ORIGIN, locale: "ja" })
    expect(ja.description).toBe("JGAD000004 (研究 hum0006)。データの種類: NGS (PBAT-seq)、NGS (ChIP-seq)。")
    expect(ja.jsonLd.name).toBe("JGAD000004: NGS (PBAT-seq)、NGS (ChIP-seq)")
    const en = datasetSeo(dataset({ typeOfData, accessType: null, experiments: [] }), { origin: ORIGIN, locale: "en" })
    expect(en.description).toBe("JGAD000004 (Research hum0006). Type of data: NGS (PBAT-seq), NGS (ChIP-seq).")
  })
})

describe("seoMeta", () => {
  it("題名・説明文・OGP・JSON-LD を並べる", () => {
    const seo = datasetSeo(dataset(), { origin: ORIGIN, locale: "en" })
    expect(seoMeta(seo, "JGAD000004 | Dataset list | NBDC Human Database", "en")).toEqual([
      { title: "JGAD000004 | Dataset list | NBDC Human Database" },
      { name: "description", content: seo.description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "NBDC Human Database" },
      { property: "og:title", content: "JGAD000004 | Dataset list | NBDC Human Database" },
      { property: "og:description", content: seo.description },
      { property: "og:url", content: `${ORIGIN}/en/dataset/JGAD000004` },
      { property: "og:locale", content: "en_US" },
      { "script:ld+json": seo.jsonLd },
    ])
  })

  it("JSON-LD が無いページは script:ld+json を書かない", () => {
    const seo = researchVersionSeo(research(), { origin: ORIGIN, locale: "ja" })
    const meta = seoMeta(seo, "hum0001 | Research list | NBDC ヒトデータベース", "ja")
    expect(meta.some((entry) => "script:ld+json" in entry)).toBe(false)
  })
})
