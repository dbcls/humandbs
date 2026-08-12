import { describe, expect, it } from "vitest"

import { exportResponse, toCsv, toTsv } from "./export"

const table = {
  headers: ["ID", "題目"],
  rows: [["hum0001", "がんゲノム研究"]],
}

describe("writing a table as CSV", () => {
  it("separates records with CRLF, as the format says", () => {
    expect(toCsv(table)).toBe("ID,題目\r\nhum0001,がんゲノム研究")
  })

  it("quotes a value that carries a comma", () => {
    expect(toCsv({ headers: ["a"], rows: [["one, two"]] })).toBe("a\r\n\"one, two\"")
  })

  it("doubles a quote inside a quoted value", () => {
    expect(toCsv({ headers: ["a"], rows: [["say \"this\""]] })).toBe("a\r\n\"say \"\"this\"\"\"")
  })

  it("keeps a line break inside the value it belongs to", () => {
    expect(toCsv({ headers: ["a"], rows: [["one\ntwo"]] })).toBe("a\r\n\"one\ntwo\"")
  })

  it("leaves a plain value alone", () => {
    expect(toCsv({ headers: ["a"], rows: [["plain"]] })).toBe("a\r\nplain")
  })

  it("stops a spreadsheet from reading a value as a formula", () => {
    expect(toCsv({ headers: ["a"], rows: [["=1+1"]] })).toBe("a\r\n'=1+1")
    expect(toCsv({ headers: ["a"], rows: [["@SUM(A1)"]] })).toBe("a\r\n'@SUM(A1)")
    expect(toCsv({ headers: ["a"], rows: [["-1"]] })).toBe("a\r\n'-1")
  })

  it("leaves a value that only contains those characters alone", () => {
    expect(toCsv({ headers: ["a"], rows: [["1+1"]] })).toBe("a\r\n1+1")
  })
})

describe("writing a table for the clipboard", () => {
  it("separates columns with tabs and rows with newlines", () => {
    expect(toTsv(table)).toBe("ID\t題目\nhum0001\tがんゲノム研究")
  })

  it("flattens a value's own line break, which a paste cannot carry", () => {
    expect(toTsv({ headers: ["a"], rows: [["one\ntwo"]] })).toBe("a\none two")
  })

  it("flattens a tab inside a value, which would otherwise start a column", () => {
    expect(toTsv({ headers: ["a"], rows: [["one\ttwo"]] })).toBe("a\none two")
  })

  it("guards a formula the same way, because a paste lands in a spreadsheet too", () => {
    expect(toTsv({ headers: ["a"], rows: [["=1+1"]] })).toBe("a\n'=1+1")
  })
})

describe("the response", () => {
  it("marks a CSV as a download, named after the listing", async () => {
    const answer = exportResponse(table, "research-list", "csv")
    expect(answer.headers.get("Content-Disposition"))
      .toBe("attachment; filename=\"research-list.csv\"")
    expect(await answer.text()).toBe(toCsv(table))
  })

  it("starts a CSV with a byte-order mark, so Excel reads it as UTF-8", async () => {
    // Reading the response as text decodes it and drops the mark, so what is
    // checked here is the bytes that go over the wire.
    const bytes = new Uint8Array(await exportResponse(table, "x", "csv").arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
  })

  it("hands the clipboard plain text with nothing to download", async () => {
    const answer = exportResponse(table, "x", "copy")
    expect(answer.headers.get("Content-Type")).toBe("text/plain; charset=utf-8")
    expect(answer.headers.get("Content-Disposition")).toBeNull()
    expect(await answer.text()).toBe(toTsv(table))
  })
})
