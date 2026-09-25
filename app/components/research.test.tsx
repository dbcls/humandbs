import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { messagesFor } from "~/i18n/messages"

import { emptyResearchContent } from "~/content/empty"
import {
  researchListRowView,
  type CatalogView,
  type CauView,
  type DatasetRowView,
  type LinksView,
  type ResearchFileListView,
  type ResearchView,
} from "~/public/view.server"

import { ResearchBody, ResearchListTable, ResearchVersionPage, runsLong } from "./research"

/**
 * The download section is the one part of this page that comes from outside the
 * portal, so it is the one part that has to be able to be absent. **A store that
 * did not respond arrives as an empty listing**, and an empty listing draws no
 * section at all — the rest of the page does not depend on the store, and
 * losing it because a bucket was unreachable would be the wrong trade.
 */

const NOTHING: ResearchFileListView = { rows: [], total: 0, page: 1, pageCount: 1, size: 20, rangeFrom: 0, rangeTo: 0 }

const NO_LINKS: LinksView = { state: "value", value: [], untranslated: false }

function view(files: ResearchFileListView, links: LinksView = NO_LINKS): ResearchView {
  return {
    humLabel: "hum0001",
    versionNumber: 1,
    versionLabel: "hum0001-v1",
    releaseDate: "2020-01-01",
    isLatest: true,
    latestVersionNumber: 1,
    untranslated: false,
    title: { state: "plain", text: "題目", untranslated: false },
    releaseNote: { state: "rich", text: [], untranslated: false },
    summary: {
      aims: { state: "rich", text: [], untranslated: false },
      methods: { state: "rich", text: [], untranslated: false },
      targets: { state: "rich", text: [], untranslated: false },
      links,
    },
    datasets: [],
    dataProviders: [],
    researchProjects: [],
    grants: [],
    relatedPublications: [],
    cau: [],
    files,
  }
}

function render(files: ResearchFileListView, links: LinksView = NO_LINKS): string {
  const Stub = createRoutesStub([{
    path: "/",
    Component: () => <ResearchVersionPage view={view(files, links)} locale="ja" />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
}

/**
 * The preview draws `ResearchBody` directly, without the version chrome the
 * public page adds around it (`app/components/preview.tsx`). Its loader keeps
 * an unsettled URL as `unsettled` rather than projecting it away first, which
 * is the one difference this file has to cover that the public render does not.
 */
function renderPreview(links: LinksView): string {
  return renderToStaticMarkup(<ResearchBody view={view(NOTHING, links)} locale="ja" />)
}

describe("the research page", () => {
  it("leaves the download section out when the prefix holds nothing to offer", () => {
    expect(render(NOTHING)).not.toContain("非制限公開ファイル")
  })

  it("draws the section, with the range within the whole prefix rather than the page", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }],
      total: 101,
      rangeFrom: 1,
      rangeTo: 100,
      page: 1,
      pageCount: 2,
      size: 20,
    })

    expect(html).toContain("非制限公開ファイル")
    expect(html).toContain("1–100 / 101 件")
  })

  it("offers the next page as an address rather than as a script", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }],
      total: 101,
      rangeFrom: 1,
      rangeTo: 100,
      page: 1,
      pageCount: 2,
      size: 20,
    })

    expect(html).toContain("href=\"/?files=2\"")
  })

  it("offers the list of every public file's address on the published page, and none in a preview", () => {
    const files: ResearchFileListView = {
      rows: [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }],
      total: 1,
      rangeFrom: 1,
      rangeTo: 1,
      page: 1,
      pageCount: 1,
      size: 20,
    }
    const Preview = createRoutesStub([{ path: "/", Component: () => <ResearchBody view={view(files)} locale="ja" /> }])

    expect(render(files)).toContain("href=\"/research/hum0001/files.txt\"")
    expect(renderToStaticMarkup(<Preview initialEntries={["/"]} />)).not.toContain("files.txt")
  })
})

describe("the dataset column of the download list", () => {
  const ROW = { accessType: null, typeOfData: null, datePublished: null }

  function withDatasets(
    datasets: ResearchView["datasets"],
    rows: ResearchFileListView["rows"],
    datasetHref?: (ref: { id: string | null, label: string }) => string | null,
  ): string {
    const files: ResearchFileListView = { rows, total: rows.length, page: 1, pageCount: 1, size: 20, rangeFrom: 1, rangeTo: rows.length }
    const Stub = createRoutesStub([{
      path: "/",
      Component: () => (
        <ResearchBody view={{ ...view(files), datasets }} locale="ja" datasetHref={datasetHref} />
      ),
    }])
    return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
  }

  /** The cells of the download table, row by row: name, size, datasets. */
  function downloadCells(html: string): string[][] {
    const table = html.slice(html.indexOf(">非制限公開ファイル<"))
    const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(table)?.[1] ?? ""
    return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...(tr[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((td) => td[1] ?? ""))
  }

  it("heads the column after the name and the size", () => {
    const html = withDatasets([], [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }])
    const heads = [...html.slice(html.indexOf(">非制限公開ファイル<")).matchAll(/<th[^>]*>([^<]*)<\/th>/g)]
      .slice(0, 3).map((th) => th[1])

    expect(heads).toEqual(["ファイル名", "サイズ", "データセット ID"])
  })

  it("links each dataset that selects the file to its page", () => {
    const html = withDatasets(
      [{ ...ROW, id: "d1", label: "NHA000001" }, { ...ROW, id: "d2", label: "NHA000002" }],
      [{ name: "a.zip", size: 1, isPublic: true, datasets: [0, 1] }],
    )
    const [cell] = downloadCells(html)[0]?.slice(2, 3) ?? []

    expect(cell).toContain("href=\"/dataset/NHA000001\"")
    expect(cell).toContain("href=\"/dataset/NHA000002\"")
  })

  it("leaves the cell empty for a file no dataset selects", () => {
    const html = withDatasets(
      [{ ...ROW, id: "d1", label: "NHA000001" }],
      [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }],
    )

    expect(downloadCells(html)[0]?.[2]).toBe("")
  })

  it("names a dataset without a label the way the dataset table does, and leads where the preview shows", () => {
    const html = withDatasets(
      [{ ...ROW, id: "d1", label: "NHA000001" }, { ...ROW, id: "d2", label: "" }],
      [{ name: "a.zip", size: 1, isPublic: false, datasets: [1] }],
      (ref) => `/preview/x/dataset/${ref.id ?? ""}`,
    )
    const cell = downloadCells(html)[0]?.[2] ?? ""

    expect(cell).toContain("データセット ID 2")
    expect(cell).toContain("href=\"/preview/x/dataset/d2\"")
  })

  it("truncates a long run of datasets, the way every dataset cell does", () => {
    const datasets = Array.from({ length: 5 }, (_, at) => ({ ...ROW, id: `d${at}`, label: `NHA00000${at + 1}` }))
    const html = withDatasets(datasets, [{ name: "a.zip", size: 1, isPublic: true, datasets: [0, 1, 2, 3, 4] }])

    expect(downloadCells(html)[0]?.[2]).toContain("他 2 件")
  })
})

/**
 * A URL has the same four states as any other value on its way to a
 * screen: settled information, an open question, or an answer with content.
 */
describe("the state a links value passes to the page", () => {
  it("draws a not-applicable URL as the not-applicable notice on the public page", () => {
    const html = render(NOTHING, { state: "not-applicable" })

    expect(html).toContain("該当なし")
  })

  it("draws an unsettled URL as the unsettled frame in a preview", () => {
    const html = renderPreview({ state: "unsettled" })

    expect(html).toContain("ご教示ください")
  })

  it("leaves the row out entirely when the resolved links are an empty list", () => {
    const html = render(NOTHING, { state: "value", value: [], untranslated: false })

    expect(html).not.toContain("URL")
  })
})

/** The same page with part of the view replaced. */
function renderWith(over: Partial<ResearchView>): string {
  const Stub = createRoutesStub([{
    path: "/",
    Component: () => <ResearchVersionPage view={{ ...view(NOTHING), ...over }} locale="ja" />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
}

function usage(datasetAccessions: string[]): CauView {
  return {
    principalInvestigator: "研究 太郎",
    affiliation: "大学",
    country: "Japan",
    researchTitle: "題目",
    periodStart: null,
    periodEnd: null,
    datasetAccessions,
  }
}

function field(text: string) {
  return { state: "plain" as const, text, untranslated: false }
}

/** A row of the dataset table under the given access type code, or with none. */
function datasetRow(label: string, accessCode: string | null): DatasetRowView {
  return {
    id: label,
    label,
    accessType: accessCode === null ? null : { code: accessCode, label: accessCode, maker: null },
    typeOfData: null,
    datePublished: null,
  }
}

const CONTROLLED = [datasetRow("JGAD000001", "controlled-access-type-1")]

/**
 * What has happened to a research since it was published, as against what the
 * research shows about itself. The distinction decides whether a section is
 * drawn at all when it holds nothing.
 */
describe("the record of who has used the controlled access data", () => {
  const t = messagesFor("ja").research
  const ACCESS_CODES = [null, "unrestricted-access", "controlled-access-type-1", "controlled-access-type-2"]

  it("keeps the section when nobody has used it yet, and shows it", () => {
    const html = renderWith({ datasets: CONTROLLED, cau: [] })

    expect(html).toContain("制限公開データの利用者一覧")
    expect(html).toContain("制限公開データの利用実績はありません")
  })

  it("leaves the section out of a version with no datasets", () => {
    expect(renderWith({ datasets: [], cau: [] })).not.toContain(t.controlledAccessUsers)
  })

  it("leaves the section out when every dataset is unrestricted", () => {
    const html = renderWith({
      datasets: [datasetRow("hum0001.v1.freq.v1", "unrestricted-access"), datasetRow("DRA000001", "unrestricted-access")],
      cau: [],
    })

    expect(html).not.toContain(t.controlledAccessUsers)
  })

  it("keeps the section when a single dataset among unrestricted ones is controlled", () => {
    const html = renderWith({
      datasets: [
        datasetRow("hum0001.v1.freq.v1", "unrestricted-access"),
        datasetRow("JGAD000001", "controlled-access-type-2"),
      ],
      cau: [],
    })

    expect(html).toContain(t.noControlledAccessUsers)
  })

  it("counts a dataset with no access type as controlled, and keeps the section", () => {
    const html = renderWith({
      datasets: [datasetRow("hum0001.v1.freq.v1", "unrestricted-access"), datasetRow("JGAD000001", null)],
      cau: [],
    })

    expect(html).toContain(t.noControlledAccessUsers)
  })

  it("is drawn exactly when some dataset is not unrestricted, whatever the order and count", () => {
    fc.assert(fc.property(fc.array(fc.constantFrom(...ACCESS_CODES), { maxLength: 6 }), (codes) => {
      const html = renderWith({
        datasets: codes.map((code, at) => datasetRow(`JGAD00000${at + 1}`, code)),
        cau: [],
      })

      expect(html.includes(t.controlledAccessUsers)).toBe(codes.some((code) => code !== "unrestricted-access"))
    }))
  })

  it("addresses each dataset it identifies, so a row leads to what was used", () => {
    const html = renderWith({ datasets: CONTROLLED, cau: [usage(["JGAD000002"])] })

    expect(html).toContain("href=\"/dataset/JGAD000002\"")
  })

  it("cuts a long list to three and holds the rest behind their count", () => {
    const html = renderWith({
      datasets: [datasetRow("JGAD000009", "controlled-access-type-1")],
      cau: [usage(["JGAD000001", "JGAD000002", "JGAD000003", "JGAD000004", "JGAD000005"])],
    })

    expect(html).toContain("JGAD000003")
    expect(html).not.toContain("JGAD000004")
    expect(html).toContain("他 2 件")
  })
})

/**
 * A grant is read from the body that funded it inwards: the funder names the
 * programme, the programme names the project, and the number identifies it.
 */
describe("what a grant shows, in the order it shows it", () => {
  it("names the funder, then the project, then its number", () => {
    const html = renderWith({
      grants: [{
        id: "g1",
        title: field("研究課題"),
        agency: field("科研費"),
        grantIds: ["19H05656", "22K15385"],
      }],
    })

    expect(html.indexOf("科研費・助成金名")).toBeLessThan(html.indexOf("研究課題名"))
    expect(html.indexOf("研究課題名")).toBeLessThan(html.indexOf("研究課題番号"))
  })

  it("gives every number a line of its own rather than running them together", () => {
    const html = renderWith({
      grants: [{
        id: "g1",
        title: field("研究課題"),
        agency: field("科研費"),
        grantIds: ["19H05656", "22K15385"],
      }],
    })

    expect(html).not.toContain("19H05656, 22K15385")
    expect(html).toContain("19H05656")
    expect(html).toContain("22K15385")
  })
})

describe("the row of the research listing", () => {
  const NO_CATALOG: CatalogView = { keyById: new Map(), keyByCode: new Map(), termById: new Map() }
  const row = researchListRowView({
    humLabel: "hum0001",
    content: emptyResearchContent(),
    datasetLabels: ["JGAD000001"],
    accessTermIds: [],
    platformTermIds: [],
    datePublished: "2020-01-01",
    dateModified: "2021-01-01",
  }, "ja", NO_CATALOG)

  const drawn = (preview: boolean): string => {
    const Stub = createRoutesStub([{
      path: "/*",
      Component: () => <ResearchListTable rows={[row]} locale="ja" preview={preview} whenEmpty="なし" />,
    }])
    return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
  }
  /** Header cells, and not the `<thead>` they are shown in. */
  const headers = (html: string): number => (html.match(/<th[\s>]/g) ?? []).length

  it("is a link into the research and its datasets on the public listing, with the cart beside it", () => {
    const html = drawn(false)
    expect(html).toContain("href=\"/research/hum0001\"")
    expect(html).toContain("href=\"/dataset/JGAD000001\"")
    expect(headers(html)).toBe(12)
  })

  /*
    A draft's row is read beside the form: the research has no page yet to be
    sent to, and a cart in the editing screen would put a draft's datasets into
    the reader's own cart.
  */
  it("presses nowhere and holds no cart when it previews a draft, and keeps every other column", () => {
    const html = drawn(true)
    expect(html).not.toContain("href=")
    expect(headers(html)).toBe(11)
    expect(html).toContain("hum0001")
    expect(html).toContain("JGAD000001")
    expect(html).toContain("2021-01-01")
  })
})

/**
 * The editing pane draws the body beside the form, and only what the form
 * writes: a section with no field beside it would show the writer places
 * nothing they type reaches.
 */
describe("the body beside the form", () => {
  const FILES: ResearchFileListView = {
    rows: [{ name: "a.zip", size: 1, isPublic: true, datasets: [] }],
    total: 1,
    rangeFrom: 1,
    rangeTo: 1,
    page: 1,
    pageCount: 1,
    size: 20,
  }
  const t = messagesFor("ja").research

  function beside(writtenOnly: boolean): string {
    const Stub = createRoutesStub([{
      path: "/",
      Component: () => (
        <ResearchBody view={{ ...view(FILES), datasets: CONTROLLED }} locale="ja" writtenOnly={writtenOnly} />
      ),
    }])
    return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
  }

  it("leaves out the datasets, the downloads and the controlled-access users, which the form does not write", () => {
    const html = beside(true)
    expect(html).not.toContain("JGAD000001")
    expect(html).not.toContain(t.downloads)
    expect(html).not.toContain(t.controlledAccessUsers)
  })

  it("keeps what the form writes", () => {
    expect(beside(true)).toContain("題目")
  })

  it("draws all three for the page and the share preview", () => {
    const html = beside(false)
    expect(html).toContain("JGAD000001")
    expect(html).toContain(t.downloads)
    expect(html).toContain(t.controlledAccessUsers)
  })
})

/**
 * A section is drawn whether or not the research has anything to put in it: once
 * it is gone a reader cannot tell "none" from "no such section", and every
 * research reads in the same order.
 */
describe("a section with nothing in it", () => {
  const t = messagesFor("ja").research
  const HEADINGS = [t.dataProvider, t.researchProjects, t.grants, t.relatedPublications]
  const SENTENCES = [t.noDataProviders, t.noResearchProjects, t.noGrants, t.noRelatedPublications]

  it("is shown on the page, and shows in a sentence that nothing is registered", () => {
    const html = render(NOTHING)
    for (const heading of HEADINGS) expect(html).toContain(heading)
    for (const sentence of SENTENCES) expect(html).toContain(sentence)
  })

  it("is shown in the share preview and beside the form as well", () => {
    const beside = renderToStaticMarkup(<ResearchBody view={view(NOTHING)} locale="ja" writtenOnly />)
    for (const html of [renderPreview(NO_LINKS), beside]) {
      for (const sentence of SENTENCES) expect(html).toContain(sentence)
    }
  })

  it("gives way to the rows once there are any", () => {
    const html = renderWith({
      grants: [{ id: "g1", title: field("研究課題"), agency: field("科研費"), grantIds: ["19H05656"] }],
    })
    expect(html).not.toContain(t.noGrants)
    expect(html).toContain("19H05656")
    // The other three are still empty, and still stand.
    expect(html).toContain(t.noResearchProjects)
  })
})

describe("the datasets a publication names", () => {
  const html = renderWith({
    relatedPublications: [{
      id: "p1",
      title: field("A paper"),
      doi: field("https://doi.org/10.1/x"),
      datasetLabels: ["JGAD000001", "JGAD000022", "DRA000001"],
      datasets: [
        { label: "JGAD000001", known: true, humLabel: null },
        { label: "JGAD000022", known: true, humLabel: "hum0002" },
        { label: "DRA000001", known: false, humLabel: null },
      ],
    }],
  })
  const cell = /<tr[^>]*>(?:(?!<\/tr>)[\s\S])*A paper[\s\S]*?<\/tr>/.exec(html)?.[0] ?? ""

  it("heads the column with the same words as the dataset table", () => {
    expect(html).toContain(messagesFor("ja").dataset.datasetId)
    expect(html).not.toContain("利用データID")
  })

  it("leads each published ID to its page, and another research's to that research too", () => {
    expect(cell).toMatch(/<a[^>]*href="\/dataset\/JGAD000001"/)
    expect(cell).toMatch(/<a[^>]*href="\/dataset\/JGAD000022"/)
    expect(cell).toMatch(/JGAD000022<\/a> \(<a[^>]*href="\/research\/hum0002"[^>]*>hum0002<\/a>\)/)
    expect(cell).not.toContain("hum0001")
  })

  it("writes an ID the portal publishes nothing under as text, with nothing to press", () => {
    expect(cell).toContain("DRA000001")
    expect(cell).not.toMatch(/href="[^"]*DRA000001"/)
  })
})

describe("an ID in a table", () => {
  it("does not break mid-ID, wherever a dataset ID is listed", () => {
    const html = renderWith({
      relatedPublications: [{
        id: "p1",
        title: field("A paper"),
        doi: field(""),
        datasetLabels: ["JGAD000107"],
        datasets: [{ label: "JGAD000107", known: true, humLabel: null }],
      }],
      datasets: CONTROLLED,
      cau: [usage(["JGAD000107", "JGAD000113"])],
    })
    // The box each occurrence of the ID sits in: the last span, cell or item opened before it.
    const boxes = [...html.matchAll(/JGAD000107/g)].map((hit) =>
      [...html.slice(0, hit.index).matchAll(/<(?:span|td|li)\b[^>]*\bclass="([^"]*)"/g)].at(-1)?.[1] ?? "")
    expect(boxes.length).toBeGreaterThanOrEqual(2)
    for (const box of boxes) {
      expect(box).toMatch(/whitespace-nowrap/)
      expect(box).not.toMatch(/break-all/)
    }
  })
})

describe("研究概要の値が段組みの次の列へ続いてよいか", () => {
  const plain = (length: number) => ({ state: "plain" as const, text: "あ".repeat(length), untranslated: false })

  it("400 字から続いてよく、399 字までは 1 つの列に収める", () => {
    expect(runsLong(plain(399))).toBe(false)
    expect(runsLong(plain(400))).toBe(true)
  })

  it("リンクを含む文は、行き先を除いた字数で数える", () => {
    const line = [{ text: "あ".repeat(250) }, { text: "い".repeat(150), href: "https://example.org/" }]
    expect(runsLong({ state: "rich", text: [line], untranslated: false })).toBe(true)
    expect(runsLong({ state: "rich", text: [[{ text: "あ".repeat(10) }]], untranslated: false })).toBe(false)
  })

  it("値が無いものは続かない", () => {
    expect(runsLong({ state: "unsettled" })).toBe(false)
    expect(runsLong({ state: "not-applicable" })).toBe(false)
  })
})
