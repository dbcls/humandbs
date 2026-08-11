import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { BoxEntry } from "~/files/box"

import { BoxTable, Downloads, type DownloadRow } from "./files"

/**
 * What the two lists put on the page.
 *
 * The one thing that has to hold whichever list is being drawn: **a file that
 * is not public is named but not linked**. The reviewer is being asked to
 * confirm the list, and handing over a way to fetch the bytes would put the
 * private bucket behind a link anybody with the share token could follow.
 */

function render(element: React.ReactElement): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
}

function downloads(rows: DownloadRow[], humLabel: string | null = "hum0009"): string {
  return render(
    <Downloads
      locale="ja"
      humLabel={humLabel}
      rows={rows}
      total={rows.length}
      page={1}
      pageCount={1}
      at={(to) => `?files=${to}`}
    />,
  )
}

function entry(over: Partial<BoxEntry> = {}): BoxEntry {
  return {
    name: "a.zip",
    size: 1000,
    updatedAt: "2026-01-01T00:00:00.000Z",
    isPublic: true,
    pending: null,
    ...over,
  }
}

describe("the download list", () => {
  it("links a public file at the address the proxy serves it from", () => {
    const html = downloads([{ name: "hum0009.v1.CpG.v1.zip", size: 1000, isPublic: true }])

    expect(html).toContain("href=\"/files/hum0009/hum0009.v1.CpG.v1.zip\"")
  })

  it("escapes each segment of a name, and keeps a separator as part of the address", () => {
    const html = downloads([{ name: "dac/DAC summary (1).pdf", size: 1, isPublic: true }])

    expect(html).toContain("href=\"/files/hum0009/dac/DAC%20summary%20(1).pdf\"")
  })

  it("names a file that is not public yet without linking to it", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false }])

    expect(html).toContain("closed.zip")
    expect(html).not.toContain("href=\"/files/hum0009/closed.zip\"")
  })

  it("says the address a file that is not public yet will have", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false }])

    expect(html).toContain("/files/hum0009/closed.zip")
  })

  it("links nothing at all before a hum label has been pinned", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false }], null)

    expect(html).not.toContain("/files/")
  })

  it("shows sizes the way a browser reports them", () => {
    expect(downloads([{ name: "a.zip", size: 78_895_250, isPublic: true }])).toContain("78.9 MB")
  })
})

describe("the box", () => {
  it("says which side of the store each file is on", () => {
    const html = render(
      <BoxTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect(html).toContain("公開")
    expect(html).toContain("非公開")
  })

  it("says a switch is running rather than saying where the file is", () => {
    const html = render(
      <BoxTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ isPublic: false, pending: { action: "publish", failed: false, lastError: null } })]}
      />,
    )

    expect(html).toContain("公開に切り替え中")
  })

  it("says a switch failed rather than that it is still running", () => {
    const html = render(
      <BoxTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ pending: { action: "unpublish", failed: true, lastError: null } })]}
      />,
    )

    expect(html).toContain("切り替えに失敗しました")
    expect(html).not.toContain("非公開に切り替え中")
  })

  it("names every file as a checkbox, because the operations take a selection", () => {
    const html = render(
      <BoxTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "a.zip" }), entry({ name: "b.zip" })]}
      />,
    )

    expect(html).toContain("name=\"name\" value=\"a.zip\"")
    expect(html).toContain("name=\"name\" value=\"b.zip\"")
  })

  it("does not offer deletion until it has been asked for twice", () => {
    const html = render(<BoxTable locale="ja" humLabel="hum0009" rows={[entry()]} />)

    expect(html).not.toContain("value=\"delete\"")
  })
})
