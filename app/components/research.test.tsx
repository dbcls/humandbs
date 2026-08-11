import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FileListView, LinksView, ResearchView } from "~/public/view.server"

import { ResearchBody, ResearchVersionPage } from "./research"

/**
 * The download section is the one part of this page that comes from outside the
 * portal, so it is the one part that has to be able to be absent. **A store that
 * did not answer arrives as an empty listing**, and an empty listing draws no
 * section at all — the rest of the page does not depend on the store, and
 * losing it because a bucket was unreachable would be the wrong trade.
 */

const NOTHING: FileListView = { rows: [], total: 0, page: 1, pageCount: 1 }

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

  it("draws the section, with the count of the whole box rather than the page", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true }],
      total: 101,
      page: 1,
      pageCount: 2,
    })

    expect(html).toContain("ダウンロード")
    expect(html).toContain("101 件")
  })

  it("offers the next page as an address rather than as a script", () => {
    const html = render({
      rows: [{ name: "a.zip", size: 1, isPublic: true }],
      total: 101,
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

    expect(html).toContain("未確定")
  })

  it("leaves the row out entirely when the resolved links are an empty list", () => {
    const html = render(NOTHING, { state: "value", value: [], untranslated: false })

    expect(html).not.toContain("URL")
  })
})
