import { describe, expect, it } from "vitest"

import { exportResponse, toTsv } from "./export"

const table = {
  headers: ["ID", "題目"],
  rows: [["hum0001", "がんゲノム研究"]],
}

describe("writing a table as TSV", () => {
  it("separates columns with tabs and rows with newlines", () => {
    expect(toTsv(table)).toBe("ID\t題目\nhum0001\tがんゲノム研究")
  })

  it("leaves a comma alone, which is what the separator was chosen for", () => {
    expect(toTsv({ headers: ["a"], rows: [["one, two"]] })).toBe("a\none, two")
  })

  it("leaves a quote alone, since nothing here is quoted", () => {
    expect(toTsv({ headers: ["a"], rows: [["say \"this\""]] })).toBe("a\nsay \"this\"")
  })

  it("flattens a value's own line break, which a reader of columns cannot carry", () => {
    expect(toTsv({ headers: ["a"], rows: [["one\ntwo"]] })).toBe("a\none two")
  })

  it("flattens a tab inside a value, which would otherwise start a column", () => {
    expect(toTsv({ headers: ["a"], rows: [["one\ttwo"]] })).toBe("a\none two")
  })

  it("stops a spreadsheet from reading a value as a formula", () => {
    expect(toTsv({ headers: ["a"], rows: [["=1+1"]] })).toBe("a\n'=1+1")
    expect(toTsv({ headers: ["a"], rows: [["@SUM(A1)"]] })).toBe("a\n'@SUM(A1)")
    expect(toTsv({ headers: ["a"], rows: [["-1"]] })).toBe("a\n'-1")
  })

  it("leaves a value that only contains those characters alone", () => {
    expect(toTsv({ headers: ["a"], rows: [["1+1"]] })).toBe("a\n1+1")
  })
})

describe("the response", () => {
  it("marks the file as a download, named after the listing", async () => {
    const answer = exportResponse(table, "research-list", "tsv")
    expect(answer.headers.get("Content-Disposition"))
      .toBe("attachment; filename=\"research-list.tsv\"")
    expect(answer.headers.get("Content-Type"))
      .toBe("text/tab-separated-values; charset=utf-8")
    expect(await answer.text()).toBe(toTsv(table))
  })

  it("starts the file with a byte-order mark, so Excel reads it as UTF-8", async () => {
    // Reading the response as text decodes it and drops the mark, so what is
    // checked here is the bytes that go over the wire.
    const bytes = new Uint8Array(await exportResponse(table, "x", "tsv").arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
  })

  it("hands the clipboard plain text with nothing to download", async () => {
    const answer = exportResponse(table, "x", "copy")
    expect(answer.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(answer.headers.get("Content-Disposition")).toBeNull()
    expect(await answer.text()).toBe(toTsv(table))
  })

  it("keeps the byte-order mark off the clipboard, where it would be a character", async () => {
    const bytes = new Uint8Array(await exportResponse(table, "x", "copy").arrayBuffer())
    expect([...bytes.slice(0, 3)]).not.toEqual([0xEF, 0xBB, 0xBF])
  })
})
