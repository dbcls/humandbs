import fc from "fast-check"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoutesStub } from "react-router"
import { describe, expect, it } from "vitest"

import type { BoxEntry } from "~/files/box"

import { FilePicker, FileSelection } from "./file-selection"

function render(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/*", Component: () => element }])
  return renderToStaticMarkup(<Stub initialEntries={["/admin"]} />)
}

function entry(name: string, isPublic = false): BoxEntry {
  return { name, size: 2048, updatedAt: "2026-09-23T00:00:00.000Z", isPublic, pending: null }
}

const BOX = [entry("a.txt", true), entry("b.tsv"), entry("c.vcf.gz")]
const FILES_AT = "/admin/research/r1/files"

function selection(listing: BoxEntry[] | null, selected: string[]): string {
  return render(
    <FileSelection
      locale="ja"
      listing={listing}
      selected={selected}
      filesAt={FILES_AT}
      onChange={() => { /* nothing changes here */ }}
    />,
  )
}

function picker(ticked: string[], filter = ""): string {
  return render(
    <FilePicker
      locale="ja"
      listing={BOX}
      ticked={ticked}
      filter={filter}
      onFilter={() => { /* nothing changes here */ }}
      onTick={() => { /* nothing changes here */ }}
    />,
  )
}

/** The box in the head, as drawn. */
function head(html: string): string {
  return /<thead[\s\S]*?(<input[^>]*>)/.exec(html)?.[1] ?? ""
}

/** The names of the rows whose box is ticked. */
function tickedRows(html: string): string[] {
  const body = /<tbody[\s\S]*<\/tbody>/.exec(html)?.[0] ?? ""
  return [...body.matchAll(/<input[^>]*>/g)]
    .map((match) => match[0])
    .filter((box) => /\bchecked=""/.test(box))
    .map((box) => /aria-label="([^"]*)"/.exec(box)?.[1] ?? "")
}

describe("the files a dataset's page lists, on the form", () => {
  it("says how many files of the box are linked, and draws no table", () => {
    const html = selection(BOX, ["a.txt", "b.tsv"])
    expect(html).toContain("2 件を紐づけています")
    expect(html).not.toContain("<table")
  })

  it("does not count a linked name the box no longer holds", () => {
    expect(selection(BOX, ["a.txt", "gone.txt"])).toContain("1 件を紐づけています")
    expect(selection(BOX, ["gone.txt"])).toContain("紐づけたファイルはありません。")
  })

  it("opens the panel from a button, and leads to the files screen in a new tab", () => {
    const html = selection(BOX, [])
    expect(html).toContain("ファイルの紐づけ")
    expect(html).toMatch(new RegExp(`href="${FILES_AT}"[^>]*target="_blank"`))
  })

  it("keeps the button on screen but not pressable when the box is empty, and says why", () => {
    const html = selection([], [])
    const button = /<button[^>]*>(?:(?!<\/button>)[\s\S])*ファイルの紐づけ/.exec(html)?.[0] ?? ""
    expect(button).toMatch(/aria-disabled="true"|disabled=""/)
    expect(html).toContain("この研究にアップロードしたファイルがないため、紐づけられません。")
  })

  it("says the store did not answer, and still leads to the files screen", () => {
    const html = selection(null, ["a.txt"])
    expect(html).toContain("ファイルストアから一覧を取得できませんでした。")
    expect(html).toContain(`href="${FILES_AT}"`)
    expect(html).not.toContain("ファイルの紐づけ")
  })
})

describe("the table in the panel", () => {
  it("draws the files screen's columns without its row actions", () => {
    const html = picker([])
    for (const column of ["ファイル名", "サイズ", "更新日", "状態"]) expect(html).toContain(column)
    expect(html).toContain("2.0 KB")
    expect(html).toContain("2026-09-23")
    expect(html).toContain("公開中")
    expect(html).toContain("未公開")
    expect(html).not.toContain("ダウンロード")
    expect(html).not.toContain("削除")
  })

  it("ticks each row that is chosen and no other", () => {
    fc.assert(fc.property(fc.subarray(BOX.map((one) => one.name)), (chosen) => {
      expect(tickedRows(picker(chosen)).toSorted()).toEqual(chosen.toSorted())
    }))
  })

  it("ticks the box in the head exactly when every row shown is chosen, whatever else is chosen besides", () => {
    fc.assert(fc.property(
      fc.subarray(BOX.map((one) => one.name)),
      fc.array(fc.constantFrom("gone-1.txt", "gone-2.txt"), { maxLength: 2 }),
      (chosen, others) => {
        const checked = /\bchecked=""/.test(head(picker([...others, ...chosen])))
        expect(checked).toBe(chosen.length === BOX.length)
      },
    ))
  })

  it("narrows the rows by every word of the window, ignoring case", () => {
    expect(tickedRows(picker(["a.txt", "b.tsv"], "TXT"))).toEqual(["a.txt"])
    const html = picker([], "b tsv")
    expect(html).toContain("b.tsv")
    expect(html).not.toContain("a.txt")
    expect(html).not.toContain("c.vcf.gz")
  })

  it("judges the head's box by the rows the window shows", () => {
    expect(/\bchecked=""/.test(head(picker(["a.txt"], "a.txt")))).toBe(true)
  })

  it("says so when the window matches nothing, and the head's box cannot be pressed", () => {
    const html = picker([], "zzz")
    expect(html).toContain("その名前のファイルはありません。")
    expect(head(html)).toContain("disabled=\"\"")
  })
})
