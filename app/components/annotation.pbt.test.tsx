import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { datasetContentArb, researchContentArb } from "~/content/arbitraries/content"
import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"
import {
  ACCESS_TYPE_KEY,
  TYPE_OF_DATA_KEY,
  anchorUnderCode,
  anchoredDatasetView,
  anchoredResearchView,
  type CatalogKeyView,
  type CatalogView,
} from "~/public/view.server"

import { DatasetBody } from "./dataset"
import { AnnotationLayer } from "./page"
import { ResearchBody } from "./research"

/**
 * The law that keeps the marks honest.
 *
 * Two things have to agree on the same set of anchors: the view builder, which
 * records what each place holds so that a preview can show the published value
 * there, and the components, which draw the mark. They cannot be tied together
 * by a type — one walks content, the other writes JSX — so the tie is this:
 * **every anchor a page draws is one the view recorded**, and with nothing left
 * empty the two sets are equal.
 *
 * A page that drew an anchor the view does not know would mark a place with no
 * value to show. A view that recorded one no page draws would count a
 * difference the reader is never shown.
 */

function key(id: string, code: string, position: number): CatalogKeyView {
  return { id, code, labelJa: code, labelEn: code, position, showOnPublicPage: true }
}

const KEYS = [
  key("k-access", ACCESS_TYPE_KEY, 0),
  key("k-type", TYPE_OF_DATA_KEY, 1),
  key("key-a", "key-a", 2),
  key("key-b", "key-b", 3),
  key("key-c", "key-c", 4),
  key("key-d", "key-d", 5),
]

const catalog: CatalogView = {
  keyById: new Map(KEYS.map((row) => [row.id, row])),
  keyByCode: new Map(KEYS.map((row) => [row.code, row])),
  termById: new Map([["t-open", { code: "unrestricted-access", labelJa: "非制限", labelEn: "Open" }]]),
}

function drawnAnchors(body: (annotate: (at: string) => null) => React.ReactNode): Set<string> {
  const drawn = new Set<string>()
  const record = (at: string): null => {
    drawn.add(at)
    return null
  }
  const Stub = createRoutesStub([{
    path: "/*",
    Component: () => <AnnotationLayer annotate={record}>{body(record)}</AnnotationLayer>,
  }])
  renderToStaticMarkup(<Stub initialEntries={["/preview/token"]} />)
  return drawn
}

function researchAnchors(content: ResearchContent, datasets: { id: string, label: string }[]) {
  const anchored = anchoredResearchView({
    humLabel: "hum0001",
    versionNumber: 2,
    releaseDate: "2026-08-10",
    latestVersionNumber: 2,
    content,
    datasets: datasets.map((row) => ({
      ...row,
      content: emptyDatasetContent(),
      datePublished: null,
    })),
    datasetLabelById: new Map(datasets.map((row) => [row.id, row.label])),
    cau: [],
    files: { rows: [], total: 0, page: 1, pageCount: 1 },
  }, "ja", catalog)

  const drawn = drawnAnchors(() => <ResearchBody view={anchored.view} locale="ja" />)
  return { recorded: new Set(Object.keys(anchored.byAnchor)), drawn }
}

function datasetAnchors(content: DatasetContent) {
  const anchored = anchoredDatasetView({
    label: "JGAD000001",
    humLabel: "hum0001",
    content,
    datePublished: null,
    dateModified: null,
    files: [],
  }, "ja", catalog)

  const drawn = drawnAnchors(() => (
    <DatasetBody
      view={anchored.view}
      locale="ja"
      researchHref="/research/hum0001"
      accessAnchor={anchorUnderCode(catalog, ACCESS_TYPE_KEY)}
      typeOfDataAnchor={anchorUnderCode(catalog, TYPE_OF_DATA_KEY)}
    />
  ))
  return { recorded: new Set(Object.keys(anchored.byAnchor)), drawn }
}

const pair = (text: string) => ({ ja: filled(text), en: filled(text) })
const prose = (text: string) => ({ ja: filled([[{ text }]]), en: filled([[{ text }]]) })

function populated(): ResearchContent {
  return {
    ...emptyResearchContent(),
    title: pair("題目"),
    summary: {
      aims: prose("目的"),
      methods: prose("方法"),
      targets: prose("対象"),
      url: {
        ja: filled([{ id: "l1", url: "https://example.jp/", text: "研究室" }]),
        en: filled([{ id: "l2", url: "https://example.com/", text: "Lab" }]),
      },
    },
    dataProviders: [{
      id: "p1",
      name: pair("提供者"),
      organization: { name: pair("機関"), address: pair("所在地") },
      orcid: filled("0000"),
      email: filled("a@example.jp"),
    }],
    researchProjects: [{
      id: "r1",
      name: pair("プロジェクト"),
      url: { ja: filled([{ id: "l3", url: "https://example.jp/p", text: "p" }]), en: filled([]) },
    }],
    grants: [{
      id: "g1",
      title: pair("研究費"),
      agency: { name: pair("機関") },
      grantIds: ["JP1"],
    }],
    relatedPublications: [{
      id: "b1",
      title: filled("論文"),
      doi: filled("https://doi.org/10.1000/1"),
      datasetIds: ["d1"],
    }],
    datasetIds: ["d1"],
  }
}

describe("the anchors a research page draws", () => {
  it("are exactly the ones the view recorded, when nothing is left empty", () => {
    const { recorded, drawn } = researchAnchors(populated(), [{ id: "d1", label: "JGAD000001" }])
    expect(drawn).toEqual(recorded)
  })

  it("are never anchors the view did not record, whatever the content holds", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const { recorded, drawn } = researchAnchors(content, [])
      expect([...drawn].filter((at) => !recorded.has(at))).toEqual([])
    }), { numRuns: 20 })
  })
})

describe("the anchors a dataset page draws", () => {
  it("are exactly the ones the view recorded, when nothing is left empty", () => {
    const content: DatasetContent = {
      ...emptyDatasetContent(),
      values: [
        { keyId: "k-access", value: { kind: "vocabulary", termIds: filled(["t-open"]) } },
        { keyId: "k-type", value: { kind: "text", text: prose("ゲノム") } },
      ],
      experiments: [{
        id: "e1",
        label: filled("Exome"),
        values: [{ keyId: "key-a", value: { kind: "text", text: prose("深度") } }],
      }],
    }
    const { recorded, drawn } = datasetAnchors(content)
    expect(drawn).toEqual(recorded)
  })

  it("are never anchors the view did not record, whatever the content holds", () => {
    fc.assert(fc.property(datasetContentArb, (content) => {
      const { recorded, drawn } = datasetAnchors(content)
      expect([...drawn].filter((at) => !recorded.has(at))).toEqual([])
    }), { numRuns: 20 })
  })
})
