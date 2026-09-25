import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { ListedFile } from "~/files/prefix"

import { FileTable, Downloads, UploadPanel, type DownloadRow } from "./files"

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
      rangeFrom={rows.length === 0 ? 0 : 1}
      rangeTo={rows.length}
      page={1}
      pageCount={1}
      at={(to) => `?files=${to}`}
    />,
  )
}

function entry(over: Partial<ListedFile> = {}): ListedFile {
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
  it("draws neither a count nor page steps while every file fits on one page", () => {
    const html = downloads([{ name: "a.zip", size: 1, isPublic: true }, { name: "b.zip", size: 2, isPublic: true }])

    expect(html).not.toContain("1–2 / 2")
    expect(html).not.toContain("?files=")
  })

  it("counts and pages once the files run past one page", () => {
    const html = render(
      <Downloads
        locale="ja"
        humLabel="hum0009"
        rows={[{ name: "a.zip", size: 1, isPublic: true }]}
        total={101}
        rangeFrom={1}
        rangeTo={100}
        page={1}
        pageCount={2}
        at={(to) => `?files=${to}`}
      />,
    )

    expect(html).toContain("1–100 / 101")
    expect(html).toContain("?files=2")
  })

  it("links a public file at the address the proxy serves it from", () => {
    const html = downloads([{ name: "hum0009.v1.CpG.v1.zip", size: 1000, isPublic: true }])

    expect(html).toContain("href=\"/files/hum0009/hum0009.v1.CpG.v1.zip\"")
  })

  it("escapes each segment of a name, and keeps a separator as part of the address", () => {
    const html = downloads([{ name: "dac/DAC summary (1).pdf", size: 1, isPublic: true }])

    expect(html).toContain("href=\"/files/hum0009/dac/DAC%20summary%20(1).pdf\"")
  })

  it("marks a name that downloads with the download icon, and a name not public yet with none", () => {
    const html = downloads([
      { name: "open.zip", size: 1, isPublic: true },
      { name: "closed.zip", size: 1, isPublic: false },
    ])

    const icon = /<a href="\/files\/hum0009\/open\.zip">(<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>)/.exec(html)?.[1] ?? ""
    expect(icon).not.toBe("")
    const closed = /<td[^>]*>(?:(?!<\/td>)[\s\S])*closed\.zip(?:(?!<\/td>)[\s\S])*<\/td>/.exec(html)?.[0] ?? ""
    expect(closed).not.toContain(icon)
  })

  it("names a file that is not public yet without linking to it", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false }])

    expect(html).toContain("closed.zip")
    expect(html).not.toContain("href=\"/files/hum0009/closed.zip\"")
  })

  it("shows the address a file that is not public yet will have", () => {
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

  it("puts the size heading on the right, where the digits of the column end", () => {
    const html = downloads([{ name: "a.zip", size: 1000, isPublic: true }])
    const heading = /<th[^>]*class="([^"]*)"[^>]*>サイズ<\/th>/.exec(html)

    expect(heading?.[1]).toContain("text-right")
  })

  it("sets the sizes in figures of one width, so that the digits line up down the column", () => {
    const html = downloads([{ name: "a.zip", size: 1000, isPublic: true }])
    const cell = /<td[^>]*class="([^"]*)"[^>]*>1\.0 KB<\/td>/.exec(html)

    expect(cell?.[1]).toContain("tabular-nums")
  })
})

describe("the research's file table", () => {
  describe("the dataset column", () => {
    function table(selectedBy?: Record<string, string[]>): string {
      return render(
        <FileTable
          locale="ja"
          humLabel="hum0009"
          rows={[entry({ name: "a.zip" }), entry({ name: "b.zip", isPublic: false })]}
          selectedBy={selectedBy}
        />,
      )
    }

    /** The cells of each row, in order. */
    function cells(html: string): string[][] {
      const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? ""
      return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
        [...(tr[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((td) => td[1] ?? ""))
    }

    it("is shown between the name and the size, under the name the public list gives it", () => {
      const heads = [...table({}).matchAll(/<th[^>]*>([^<]*)<\/th>/g)].slice(0, 3).map((th) => th[1])

      expect(heads).toEqual(["ファイル名", "データセット ID", "サイズ"])
    })

    it("leads to each dataset's public page in a new tab", () => {
      const cell = cells(table({ "a.zip": ["NHA000001", "NHA000002"] }))[0]?.[1] ?? ""

      expect(cell).toContain("href=\"/dataset/NHA000001\"")
      expect(cell).toContain("href=\"/dataset/NHA000002\"")
      expect(cell).toContain("target=\"_blank\"")
    })

    it("leaves the cell empty for a file no dataset selects", () => {
      expect(cells(table({ "a.zip": ["NHA000001"] }))[1]?.[1]).toBe("")
    })

    it("is not there at all when nothing was said about selections", () => {
      expect(table()).not.toContain("データセット ID")
    })
  })

  it("offers to copy the address of a public file, and of no other", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect([...html.matchAll(/アドレスのコピー/g)]).toHaveLength(1)
    expect(html).toContain("title=\"/files/hum0009/open.zip\"")
    expect(html).not.toContain("title=\"/files/hum0009/closed.zip\"")
  })

  it("names nothing to copy while the research has no label, since no address responds", () => {
    const html = render(<FileTable locale="ja" humLabel={null} rows={[entry({ name: "open.zip" })]} />)

    expect(html).not.toContain("アドレスをコピー")
  })

  it("shows which side of the store each file is on", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect(html).toContain("公開中")
    expect(html).toContain("未公開")
  })

  it("offers to fetch a public file as a download, and no other", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect([...html.matchAll(/ダウンロード/g)]).toHaveLength(1)
    expect(html).toMatch(/href="\/files\/hum0009\/open\.zip"[^>]*download/)
    // The name itself is not a link: a fetch is not what reading a name requests.
    expect(html).not.toMatch(/<a[^>]*>[^<]*open\.zip<\/a>/)
  })

  it("offers the other side on the one switch control", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect(html).toContain("value=\"unpublish\"")
    expect(html).toContain("value=\"publish\"")
    expect([...html.matchAll(/公開停止/g)]).toHaveLength(1)
  })

  it("shows on the control that a switch is running, and will not take a second press", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ isPublic: false, pending: { action: "publish", failed: false, lastError: null } })]}
      />,
    )

    expect(html).toContain("切り替え中")
    expect(html).toContain("公開へ切り替え中です")
    expect(html).toContain("切り替え中は名前を変えられません")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?切り替え中/)
  })

  it("shows a switch failed, beside the side the file is on, and leaves the control pressable", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ pending: { action: "unpublish", failed: true, lastError: "copy refused" } })]}
      />,
    )

    expect(html).toContain("切り替えに失敗しました")
    expect(html).toContain("copy refused")
    expect(html).toContain("公開中")
    expect(html).not.toContain("未公開へ切り替え中")
    expect(html).not.toContain("disabled=\"\"")
  })

  it("names the file in every form of its row, so a press names what it acts on", () => {
    const html = render(
      <FileTable
        locale="ja"
        humLabel="hum0009"
        rows={[entry({ name: "a.zip" }), entry({ name: "b.zip" })]}
      />,
    )

    expect(html).not.toContain("type=\"checkbox\"")
    expect([...html.matchAll(/name="name" value="a\.zip"/g)].length).toBeGreaterThanOrEqual(2)
    expect(html).toContain("name=\"from\" value=\"b.zip\"")
  })

  it("changes the name on the one panel every slug is changed in", () => {
    const html = render(<FileTable locale="ja" humLabel="hum0009" rows={[entry({ name: "a.zip" })]} />)

    expect(html).toContain("slug の編集")
  })

  it("does not offer deletion until it has been asked for twice", () => {
    const html = render(<FileTable locale="ja" humLabel="hum0009" rows={[entry()]} />)

    expect(html).not.toContain("value=\"delete\"")
  })
})

describe("the upload panel", () => {
  /**
   * The question about names the prefix already holds is raised by a choice, not
   * by a control, so at rest there is nothing of it on the page: the chooser
   * is the one thing to press.
   */
  it("requests nothing at rest, and offers only the chooser", () => {
    const html = render(<UploadPanel locale="ja" endpoint="/admin/files/upload" threshold={1} partSize={1} />)

    expect(html.match(/<button/g)).toHaveLength(1)
    expect(html).toContain("ファイルの選択")
    expect(html).not.toContain("上書き")
  })
})
