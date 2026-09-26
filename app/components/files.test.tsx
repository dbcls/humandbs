import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { ListedFile } from "~/files/prefix"
import { fileListQuery } from "~/public/urls"

import { FileName, FileTable, Downloads, UploadPanel, UrlListLink, type DownloadRow } from "./files"

/**
 * What the two lists put on the page.
 *
 * The one thing that has to hold whichever list is being drawn: **a file that
 * is not public is named but not linked**. The reviewer is being asked to
 * confirm the list, and handing over a way to fetch the bytes would put the
 * private bucket behind a link anybody with the share token could follow.
 */

const RESEARCH = "0b9f3c2e-4a1d-4e6b-9c7f-2d8e5a6b7c10"

function render(element: React.ReactElement): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />)
}

function downloads(rows: DownloadRow[], humLabel: string | null = "hum0009", origin?: string): string {
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
      size={20}
      at={fileListQuery}
      origin={origin}
    />,
  )
}

/** The names over the columns, in order. */
function heads(html: string): string[] {
  return [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((th) => th[1] ?? "")
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
    const html = downloads([{ name: "a.zip", size: 1, isPublic: true, label: "" }, { name: "b.zip", size: 2, isPublic: true, label: "" }])

    expect(html).not.toContain("1–2 / 2")
    expect(html).not.toContain("?files=")
  })

  function paged(total: number, size: 20 | 50 | 100, page = 1): string {
    const pageCount = Math.max(1, Math.ceil(total / size))
    return render(
      <Downloads
        locale="ja"
        humLabel="hum0009"
        rows={[{ name: "a.zip", size: 1, isPublic: true, label: "" }]}
        total={total}
        rangeFrom={(page - 1) * size + 1}
        rangeTo={Math.min(page * size, total)}
        page={page}
        pageCount={pageCount}
        size={size}
        at={fileListQuery}
      />,
    )
  }

  it("counts and pages once the files run past one page", () => {
    const html = paged(101, 20)

    expect(html).toContain("1–20 / 101")
    expect(html).toContain("?files=2")
  })

  it("offers the page sizes once the files run past the smallest page, and none at or under it", () => {
    expect(paged(21, 20)).toContain("表示件数")
    expect(paged(20, 20)).not.toContain("表示件数")
  })

  it("keeps offering the page sizes when a larger size puts every file on one page", () => {
    const html = paged(45, 50)

    expect(html).toContain("表示件数")
    expect(html).toContain("1–45 / 45")
  })

  it("keeps a chosen page size across the page steps, and leaves the default out of the address", () => {
    expect(paged(250, 50)).toContain("href=\"/?files=2&amp;fileRows=50\"")
    expect(paged(250, 20)).toContain("href=\"/?files=2\"")
  })

  it("returns to the first page when a page size is chosen", () => {
    const html = paged(250, 20, 3)

    expect(html).toContain("href=\"/?files=1&amp;fileRows=100\"")
    expect(html).toContain("href=\"/?files=1\"")
  })

  it("offers the list of every file's address as a download", () => {
    const html = render(<UrlListLink locale="ja" to="/research/hum0009/files.txt" />)

    expect(html).toMatch(/<a[^>]*href="\/research\/hum0009\/files\.txt"[^>]*download=""[^>]*>[\s\S]*URL の一覧のダウンロード/)
  })

  it("ends each row in a copy of the file's whole URL on the given origin", () => {
    const html = downloads(
      [{ name: "a.zip", size: 1, isPublic: true, label: "" }, { name: "dac/DAC summary (1).pdf", size: 1, isPublic: true, label: "" }],
      "hum0009",
      "https://humandbs.example",
    )

    expect([...html.matchAll(/title="https:\/\/humandbs\.example\/files\//g)]).toHaveLength(2)
    expect(html).toContain("title=\"https://humandbs.example/files/hum0009/a.zip\"")
    expect(html).toContain("title=\"https://humandbs.example/files/hum0009/dac/DAC%20summary%20(1).pdf\"")
  })

  it("names the copy column for a reader hearing the row, and not on the screen", () => {
    const html = downloads([{ name: "a.zip", size: 1, isPublic: true, label: "" }], "hum0009", "https://humandbs.example")

    expect(html).toContain("<span class=\"sr-only\">URL のコピー</span>")
  })

  it("offers no copy and no column for it where no origin is given, as in a preview", () => {
    const html = downloads([{ name: "a.zip", size: 1, isPublic: true, label: "" }])

    expect(html).not.toContain("URL のコピー")
    expect(heads(html)).toEqual(["ファイル名", "ラベル", "サイズ"])
  })

  it("offers no copy for a row that is not public, even where an origin is given", () => {
    const html = downloads(
      [{ name: "open.zip", size: 1, isPublic: true, label: "" }, { name: "closed.zip", size: 1, isPublic: false, label: "" }],
      "hum0009",
      "https://humandbs.example",
    )

    expect([...html.matchAll(/title="https:\/\/humandbs\.example\/files\//g)]).toHaveLength(1)
    expect(html).not.toContain("title=\"https://humandbs.example/files/hum0009/closed.zip\"")
  })

  it("links a public file at the address the proxy serves it from", () => {
    const html = downloads([{ name: "hum0009.v1.CpG.v1.zip", size: 1000, isPublic: true, label: "" }])

    expect(html).toContain("href=\"/files/hum0009/hum0009.v1.CpG.v1.zip\"")
  })

  it("escapes each segment of a name, and keeps a separator as part of the address", () => {
    const html = downloads([{ name: "dac/DAC summary (1).pdf", size: 1, isPublic: true, label: "" }])

    expect(html).toContain("href=\"/files/hum0009/dac/DAC%20summary%20(1).pdf\"")
  })

  it("marks a name that downloads with the download icon, and a name not public yet with none", () => {
    const html = downloads([
      { name: "open.zip", size: 1, isPublic: true, label: "" },
      { name: "closed.zip", size: 1, isPublic: false, label: "" },
    ])

    const icon = /<a href="\/files\/hum0009\/open\.zip" class="visitable">(<svg[^>]*aria-hidden="true"[\s\S]*?<\/svg>)/.exec(html)?.[1] ?? ""
    expect(icon).not.toBe("")
    const closed = /<td[^>]*>(?:(?!<\/td>)[\s\S])*closed\.zip(?:(?!<\/td>)[\s\S])*<\/td>/.exec(html)?.[0] ?? ""
    expect(closed).not.toContain(icon)
  })

  it("names a file that is not public yet without linking to it", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false, label: "" }])

    expect(html).toContain("closed.zip")
    expect(html).not.toContain("href=\"/files/hum0009/closed.zip\"")
    expect(html).not.toContain("/files/download")
    expect(html).not.toContain("ダウンロード")
  })

  it("shows the address a file that is not public yet will have", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false, label: "" }])

    expect(html.replaceAll("<wbr/>", "")).toContain("/files/hum0009/closed.zip")
  })

  it("links nothing at all before a hum label has been pinned", () => {
    const html = downloads([{ name: "closed.zip", size: 1, isPublic: false, label: "" }], null)

    expect(html).not.toContain("/files/")
  })

  it("shows sizes the way a browser reports them", () => {
    expect(downloads([{ name: "a.zip", size: 78_895_250, isPublic: true, label: "" }])).toContain("78.9 MB")
  })

  it("sets the size and its heading to the left, as every column is", () => {
    const html = downloads([{ name: "a.zip", size: 1000, isPublic: true, label: "" }])

    expect(html).not.toContain("text-right")
  })

  it("puts the label and the size after the name, and the datasets last", () => {
    const html = render(
      <Downloads
        locale="ja"
        humLabel="hum0009"
        rows={[{ name: "a.zip", size: 1000, isPublic: true, label: "" }]}
        total={1}
        rangeFrom={1}
        rangeTo={1}
        page={1}
        pageCount={1}
        size={20}
        at={fileListQuery}
        selectedBy={() => "NHA000001"}
      />,
    )

    expect(heads(html)).toEqual(["ファイル名", "ラベル", "サイズ", "データセット ID"])
    expect(html).toMatch(/1\.0 KB<\/td><td[^>]*>NHA000001<\/td><\/tr>/)
  })

  it("shows each file's label beside its name, and an empty cell for a file with none", () => {
    const html = downloads([
      { name: "a.xlsx", size: 1, isPublic: true, label: "Dictionary file" },
      { name: "b.zip", size: 1, isPublic: true, label: "" },
    ])

    expect(html).toMatch(/a\.xlsx[\s\S]*?<\/td><td[^>]*>Dictionary file<\/td>/)
    expect(html).toMatch(/b\.zip[\s\S]*?<\/td><td[^>]*><\/td><td[^>]*>1 B<\/td>/)
  })

  it("keeps the label's column where no file of the list has a label", () => {
    expect(heads(downloads([{ name: "a.zip", size: 1, isPublic: true, label: "" }]))).toContain("ラベル")
  })

  it("heads the label's column in the page's language", () => {
    const html = render(
      <Downloads
        locale="en"
        humLabel="hum0009"
        rows={[{ name: "a.zip", size: 1, isPublic: true, label: "" }]}
        total={1}
        rangeFrom={1}
        rangeTo={1}
        page={1}
        pageCount={1}
        size={20}
        at={fileListQuery}
      />,
    )

    expect(heads(html)).toEqual(["File", "Label", "Size"])
  })

  it("sets the sizes in figures of one width, so that the digits line up down the column", () => {
    const html = downloads([{ name: "a.zip", size: 1000, isPublic: true, label: "" }])
    const cell = /<td[^>]*class="([^"]*)"[^>]*>1\.0 KB<\/td>/.exec(html)

    expect(cell?.[1]).toContain("tabular-nums")
  })
})

describe("the research's file table", () => {
  describe("the dataset column", () => {
    function table(selectedBy?: Record<string, string[]>): string {
      return render(
        <FileTable
          labels={{}}
          locale="ja"
          origin="https://humandbs.example"
          researchId={RESEARCH}
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

    it("follows the name, the labels and the size, as in the public list, under the name the public list gives it", () => {
      expect(heads(table({})).slice(0, 5)).toEqual(["ファイル名", "ラベル (日本語)", "ラベル (英語)", "サイズ", "データセット ID"])
    })

    it("leads to each dataset's public page in a new tab", () => {
      const cell = cells(table({ "a.zip": ["NHA000001", "NHA000002"] }))[0]?.[4] ?? ""

      expect(cell).toContain("href=\"/dataset/NHA000001\"")
      expect(cell).toContain("href=\"/dataset/NHA000002\"")
      expect(cell).toContain("target=\"_blank\"")
    })

    it("leaves the cell empty for a file no dataset selects", () => {
      expect(cells(table({ "a.zip": ["NHA000001"] }))[1]?.[4]).toBe("")
    })

    it("is not there at all when nothing was said about selections", () => {
      expect(table()).not.toContain("データセット ID")
    })
  })

  it("offers to copy the whole URL of a public file, on the site's public origin, and of no other", () => {
    const html = render(
      <FileTable
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect([...html.matchAll(/URL のコピー/g)]).toHaveLength(1)
    expect(html).toContain("title=\"https://humandbs.example/files/hum0009/open.zip\"")
    expect(html).not.toContain("title=\"https://humandbs.example/files/hum0009/closed.zip\"")
  })

  it("names nothing to copy while the research has no label, since no address responds", () => {
    const html = render(<FileTable labels={{}} locale="ja" origin="https://humandbs.example" researchId={RESEARCH} humLabel={null} rows={[entry({ name: "open.zip" })]} />)

    expect(html).not.toContain("URL のコピー")
  })

  it("shows which side of the store each file is on", () => {
    const html = render(
      <FileTable
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" }), entry({ name: "closed.zip", isPublic: false })]}
      />,
    )

    expect(html).toContain("公開中")
    expect(html).toContain("未公開")
  })

  it("fetches a public file from its public address", () => {
    const html = render(
      <FileTable
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
        humLabel="hum0009"
        rows={[entry({ name: "open.zip" })]}
      />,
    )

    expect([...html.matchAll(/ダウンロード/g)]).toHaveLength(1)
    expect(html).toMatch(/href="\/files\/hum0009\/open\.zip"[^>]*download/)
    expect(html).not.toContain("/files/download")
    // The name itself is not a link: a fetch is not what reading a name requests.
    expect(html).not.toMatch(/<a[^>]*>[^<]*open\.zip<\/a>/)
  })

  it("fetches a private file through the screen's own download address, which signs it", () => {
    const html = render(
      <FileTable
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
        humLabel="hum0009"
        rows={[entry({ name: "説明 (1).zip", isPublic: false })]}
      />,
    )

    expect([...html.matchAll(/ダウンロード/g)]).toHaveLength(1)
    expect(html).toContain(
      `href="/admin/research/${RESEARCH}/files/download?name=%E8%AA%AC%E6%98%8E+%281%29.zip"`,
    )
    expect(html).not.toContain("/files/hum0009/")
  })

  it("offers a download for a private file while the research has no label", () => {
    const html = render(
      <FileTable labels={{}} locale="ja" origin="https://humandbs.example" researchId={RESEARCH} humLabel={null} rows={[entry({ name: "a.zip", isPublic: false })]} />,
    )

    expect(html).toContain(`/admin/research/${RESEARCH}/files/download?name=a.zip`)
  })

  it("offers the other side on the one switch control", () => {
    const html = render(
      <FileTable
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
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
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
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
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
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
        labels={{}}
        locale="ja"
        origin="https://humandbs.example"
        researchId={RESEARCH}
        humLabel="hum0009"
        rows={[entry({ name: "a.zip" }), entry({ name: "b.zip" })]}
      />,
    )

    expect(html).not.toContain("type=\"checkbox\"")
    expect([...html.matchAll(/name="name" value="a\.zip"/g)].length).toBeGreaterThanOrEqual(2)
    expect(html).toContain("name=\"from\" value=\"b.zip\"")
  })

  describe("the labels", () => {
    function table(labels: Record<string, { ja: string, en: string }>): string {
      return render(
        <FileTable
          labels={labels}
          locale="ja"
          origin="https://humandbs.example"
          researchId={RESEARCH}
          humLabel="hum0009"
          rows={[entry({ name: "a.zip" }), entry({ name: "b.zip", isPublic: false })]}
        />,
      )
    }

    /** The two label cells of each row, as text. */
    function labelCells(html: string): string[][] {
      const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? ""
      return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
        [...(tr[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].slice(1, 3).map((td) => td[1] ?? ""))
    }

    it("shows each language in its own column, and an empty cell for a language not written", () => {
      expect(labelCells(table({ "a.zip": { ja: "", en: "Dictionary file" } }))).toEqual([["", "Dictionary file"], ["", ""]])
    })

    /** How many rows offer the label's editing, counted by its trigger. */
    const triggers = (html: string): number => [...html.matchAll(/>ラベルの編集</g)].length

    it("offers the label's editing on every row, public or not, naming the file it saves for", () => {
      const html = table({ "a.zip": { ja: "辞書", en: "Dictionary" } })

      expect(triggers(html)).toBe(2)
      expect(html).toMatch(/<form[^>]*method="post"[^>]*>(?:(?!<\/form>)[\s\S])*name="name" value="b\.zip"(?:(?!<\/form>)[\s\S])*>ラベルの編集</)
    })

    it("offers the label's editing while a switch runs, since a switch keeps the name", () => {
      const html = render(
        <FileTable
          labels={{}}
          locale="ja"
          origin="https://humandbs.example"
          researchId={RESEARCH}
          humLabel="hum0009"
          rows={[entry({ isPublic: false, pending: { action: "publish", failed: false, lastError: null } })]}
        />,
      )

      expect(triggers(html)).toBe(1)
      expect(html).not.toMatch(/disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*ラベルの編集/)
    })
  })

  it("changes the name on the one panel every slug is changed in", () => {
    const html = render(<FileTable labels={{}} locale="ja" origin="https://humandbs.example" researchId={RESEARCH} humLabel="hum0009" rows={[entry({ name: "a.zip" })]} />)

    expect(html).toContain("slug の編集")
  })

  it("does not offer deletion until it has been asked for twice", () => {
    const html = render(<FileTable labels={{}} locale="ja" origin="https://humandbs.example" researchId={RESEARCH} humLabel="hum0009" rows={[entry()]} />)

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

describe("FileName", () => {
  it("offers a break after each / and _ and nowhere inside a word", () => {
    expect(render(<FileName name="supplement/hum0005_variant_counts.tsv" />))
      .toBe("supplement/<wbr/>hum0005_<wbr/>variant_<wbr/>counts.tsv")
  })

  it("offers no break after a leading /, which would leave it alone on a line", () => {
    expect(render(<FileName name="/files/hum0009/a.zip" />)).toBe("/files/<wbr/>hum0009/<wbr/>a.zip")
  })

  it("leaves a name with no separator whole", () => {
    expect(render(<FileName name="README.txt" />)).toBe("README.txt")
  })

  it("draws every character of the name, in order", () => {
    fc.assert(fc.property(fc.string(), (name) => {
      const html = render(<FileName name={name} />).replaceAll("<wbr/>", "")
      expect(html).toBe(renderToStaticMarkup(<>{name}</>))
    }))
  })
})
