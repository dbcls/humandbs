import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { FileListView, ResearchView } from "~/public/view.server"

import { ResearchVersionPage } from "./research"

/**
 * The download section is the one part of this page that comes from outside the
 * portal, so it is the one part that has to be able to be absent. **A store that
 * did not answer arrives as an empty listing**, and an empty listing draws no
 * section at all — the rest of the page does not depend on the store, and
 * losing it because a bucket was unreachable would be the wrong trade.
 */

const NOTHING: FileListView = { rows: [], total: 0, page: 1, pageCount: 1 }

function view(files: FileListView): ResearchView {
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
      links: [],
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

function render(files: FileListView): string {
  const Stub = createRoutesStub([{
    path: "/",
    Component: () => <ResearchVersionPage view={view(files)} locale="ja" />,
  }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
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
