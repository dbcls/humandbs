import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import { messagesFor } from "~/i18n/messages"

import { emptyResearchContent } from "~/content/empty"
import {
  researchListRowView,
  type CatalogView,
  type CauView,
  type FileListView,
  type LinksView,
  type ResearchView,
} from "~/public/view.server"

import { ResearchBody, ResearchListTable, ResearchVersionPage } from "./research"

/**
 * The download section is the one part of this page that comes from outside the
 * portal, so it is the one part that has to be able to be absent. **A store that
 * did not answer arrives as an empty listing**, and an empty listing draws no
 * section at all — the rest of the page does not depend on the store, and
 * losing it because a bucket was unreachable would be the wrong trade.
 */

const NOTHING: FileListView = { rows: [], total: 0, page: 1, pageCount: 1, rangeFrom: 0, rangeTo: 0 }

const NO_LINKS: LinksView = { state: "value", value: [], untranslated: false }

function view(files: FileListView, links: LinksView = NO_LINKS): ResearchView {
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

function render(files: FileListView, links: LinksView = NO_LINKS): string {
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
  it("leaves the download section out when the box holds nothing to offer", () => {
    expect(render(NOTHING)).not.toContain("ダウンロード")
  })

  it("draws the section, with the range within the whole box rather than the page", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true }],
      total: 101,
      rangeFrom: 1,
      rangeTo: 100,
      page: 1,
      pageCount: 2,
    })

    expect(html).toContain("ダウンロード")
    expect(html).toContain("1–100 / 101 件")
  })

  it("offers the next page as an address rather than as a script", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true }],
      total: 101,
      rangeFrom: 1,
      rangeTo: 100,
      page: 1,
      pageCount: 2,
    })

    expect(html).toContain("href=\"/?files=2\"")
  })
})

/**
 * A URL carries the same four states as any other value on its way to a
 * screen (docs/data-model.md's table of value states): settled information,
 * an open question, or an answer with content.
 */
describe("the state a links value carries to the page", () => {
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

/**
 * What has happened to a research since it was published, as against what the
 * research says about itself. The distinction decides whether a section is
 * drawn at all when it holds nothing.
 */
describe("the record of who has used the controlled access data", () => {
  it("keeps the section when nobody has used it yet, and says so", () => {
    const html = renderWith({ cau: [] })

    expect(html).toContain("制限公開データの利用者一覧")
    expect(html).toContain("制限公開データの利用実績はまだありません")
  })

  it("addresses each dataset it names, so a row leads to what was used", () => {
    const html = renderWith({ cau: [usage(["JGAD000001"])] })

    expect(html).toContain("href=\"/dataset/JGAD000001\"")
  })

  it("cuts a long list to three and holds the rest behind their count", () => {
    const html = renderWith({
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
describe("what a grant says, in the order it says it", () => {
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
  /** Header cells, and not the `<thead>` they stand in. */
  const headers = (html: string): number => (html.match(/<th[\s>]/g) ?? []).length

  it("is a way into the research and its datasets on the public listing, with the cart beside it", () => {
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
 * nothing they type reaches (docs/editing.md の「フォームの隣に立つ公開ページ」).
 */
describe("the body beside the form", () => {
  const FILES: FileListView = {
    rows: [{ name: "a.zip", size: 1, isPublic: true }],
    total: 1,
    rangeFrom: 1,
    rangeTo: 1,
    page: 1,
    pageCount: 1,
  }
  const t = messagesFor("ja").research

  function beside(writtenOnly: boolean): string {
    return renderToStaticMarkup(<ResearchBody view={view(FILES)} locale="ja" writtenOnly={writtenOnly} />)
  }

  it("leaves out the datasets, the downloads and the controlled-access users, which the form does not write", () => {
    const html = beside(true)
    expect(html).not.toContain(t.noDatasets)
    expect(html).not.toContain(t.downloads)
    expect(html).not.toContain(t.controlledAccessUsers)
  })

  it("keeps what the form writes", () => {
    expect(beside(true)).toContain("題目")
  })

  it("draws all three for the page and the share preview", () => {
    const html = beside(false)
    expect(html).toContain(t.noDatasets)
    expect(html).toContain(t.downloads)
    expect(html).toContain(t.controlledAccessUsers)
  })
})

/**
 * A section stands whether or not the research has anything to put in it: once
 * it is gone a reader cannot tell "none" from "no such section", and every
 * research reads in the same order (docs/public-pages.md の「research の版」).
 */
describe("a section with nothing in it", () => {
  const t = messagesFor("ja").research
  const HEADINGS = [t.dataProvider, t.researchProjects, t.grants, t.relatedPublications]
  const SENTENCES = [t.noDataProviders, t.noResearchProjects, t.noGrants, t.noRelatedPublications]

  it("stands on the page, and says in a sentence that nothing is registered", () => {
    const html = render(NOTHING)
    for (const heading of HEADINGS) expect(html).toContain(heading)
    for (const sentence of SENTENCES) expect(html).toContain(sentence)
  })

  it("stands in the share preview and beside the form as well", () => {
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
