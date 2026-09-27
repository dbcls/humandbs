import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { AnchoredValue } from "~/public/view.server"

import { changeViews, elementLines, elementName, orderCompare, type ChangeSide } from "./publish-changes"

const words = {
  nameOf: (path: string) => `hum0001 / ${path}`,
  termLabel: (id: string) => `term ${id}`,
  elementName: (element: unknown) => elementName(element, (keyId) => `key ${keyId}`),
}

const text = (value: string) => ({ state: "value" as const, text: value })

function compareOf(path: string, before: ChangeSide, after: ChangeSide) {
  return changeViews([path], before, after, words)[0]
}

describe("changeViews", () => {
  it("names each place as the places of comments are named, in the order given", () => {
    const views = changeViews(["title", "summary.aims"], { input: {} }, { input: {} }, words)
    expect(views.map((view) => view.name)).toEqual(["hum0001 / title", "hum0001 / summary.aims"])
  })

  it("compares a field both languages at a time, a line each, as the form holds it", () => {
    const pair = (ja: string, en: string) => ({ title: { ja: text(ja), en: text(en) } })
    const view = compareOf("title", { input: pair("旧", "Old") }, { input: pair("新", "Old") })
    expect(view?.compare).toEqual({
      kind: "lines",
      rows: [
        { label: "ja", before: text("旧"), after: text("新") },
        { label: "en", before: text("Old"), after: text("Old") },
      ],
    })
  })

  it("compares a table of elements as the page draws it, even where the form has the list", () => {
    const rows = (cells: string[]): AnchoredValue => ({
      kind: "rows",
      rows: { columns: ["タイトル"], rows: cells.map((cell, at) => ({ id: `p${at}`, cells: [cell] })) },
    })
    const view = compareOf(
      "relatedPublications",
      { input: { relatedPublications: [{ id: "p0" }] }, drawn: { relatedPublications: rows(["A"]) } },
      { input: { relatedPublications: [{ id: "p0" }, { id: "p1" }] }, drawn: { relatedPublications: rows(["A", "B"]) } },
    )
    expect(view?.compare).toEqual({
      kind: "rows",
      before: { columns: ["タイトル"], rows: [{ id: "p0", cells: ["A"] }] },
      after: { columns: ["タイトル"], rows: [{ id: "p0", cells: ["A"] }, { id: "p1", cells: ["B"] }] },
    })
  })

  it("compares a list of IDs as the page draws it, with the datasets' labels rather than their identities", () => {
    const ids = (items: string[]): AnchoredValue => ({ kind: "ids", ids: { state: "value", items } })
    const path = "relatedPublications.p0.datasetIds"
    const view = compareOf(
      path,
      { input: {}, drawn: { [path]: ids(["JGAD000001"]) } },
      { input: {}, drawn: { [path]: ids(["JGAD000001", "JGAD000002"]) } },
    )
    expect(view?.compare).toEqual({
      kind: "lines",
      rows: [{ label: "", before: text("JGAD000001"), after: text("JGAD000001\nJGAD000002") }],
    })
  })

  it("names a vocabulary value's terms by their labels", () => {
    const slot = (termIds: string[]) => ({ values: [{ keyId: "k", value: { kind: "vocabulary", state: "value", termIds } }] })
    const view = compareOf("values.k", { input: slot(["a"]) }, { input: slot(["a", "b"]) })
    expect(view?.compare).toEqual({
      kind: "lines",
      rows: [{ label: "", before: text("term a"), after: text("term a, term b") }],
    })
  })

  it("compares a list the page does not draw as a table by which elements it holds", () => {
    const experiments = (...names: [string, string][]) => ({
      experiments: names.map(([id, name]) => ({ id, label: text(name), values: [] })),
    })
    const view = compareOf(
      "experiments",
      { input: experiments(["e1", "WES"], ["e2", "RNA-seq"]) },
      { input: experiments(["e2", "RNA-seq"], ["e3", "WGS"]) },
    )
    expect(view?.compare).toEqual({
      kind: "lines",
      rows: [{ label: "", before: text("WES\nRNA-seq"), after: text("RNA-seq\nWGS") }],
    })
  })

  it("compares a date written as it is", () => {
    const view = compareOf("releaseDate", { input: { releaseDate: "" } }, { input: { releaseDate: "2026-09-27" } })
    expect(view?.compare).toEqual({ kind: "lines", rows: [{ label: "", before: text(""), after: text("2026-09-27") }] })
  })

  it("names alone a place with nothing it can set side by side", () => {
    const number = { values: [{ keyId: "k", value: { kind: "number" } }] }
    expect(compareOf("values.k", { input: number }, { input: number })?.compare).toBeNull()
    expect(compareOf("nowhere", { input: {} }, { input: {} })).toEqual({ path: "nowhere", name: "hum0001 / nowhere", compare: null })
  })
})

describe("elementLines", () => {
  const element = fc.record({ id: fc.uuid(), name: fc.stringMatching(/^[a-z]{1,8}$/) })
  const nameOf = (one: unknown) => (one as { name: string }).name

  it("sets each side's elements a line each, in its own order, and nothing on a side that holds none", () => {
    fc.assert(fc.property(fc.array(element, { maxLength: 8 }), fc.array(element, { maxLength: 8 }), (before, after) => {
      const [row] = elementLines(before, after, nameOf)
      expect(row?.before).toEqual(before.length === 0 ? null : text(before.map((one) => one.name).join("\n")))
      expect(row?.after).toEqual(after.length === 0 ? null : text(after.map((one) => one.name).join("\n")))
    }))
  })
})

describe("orderCompare", () => {
  it("numbers each side's datasets from 1 in its own order, and pairs the rows by dataset", () => {
    const compare = orderCompare(["a", "b", "c"], ["c", "a", "b"], (id) => id.toUpperCase(), { position: "順番", datasetId: "データセット ID" })
    expect(compare).toEqual({
      kind: "rows",
      before: { columns: ["順番", "データセット ID"], rows: [{ id: "a", cells: ["1", "A"] }, { id: "b", cells: ["2", "B"] }, { id: "c", cells: ["3", "C"] }] },
      after: { columns: ["順番", "データセット ID"], rows: [{ id: "c", cells: ["1", "C"] }, { id: "a", cells: ["2", "A"] }, { id: "b", cells: ["3", "B"] }] },
    })
  })
})

describe("elementName", () => {
  const key = (keyId: string) => `key ${keyId}`

  it("names a value by its key, an experiment by its name, and a provider by its Japanese name, else its English", () => {
    expect(elementName({ keyId: "k1", value: {} }, key)).toBe("key k1")
    expect(elementName({ id: "e", label: text("WES") }, key)).toBe("WES")
    expect(elementName({ id: "p", name: { ja: text("山田"), en: text("Yamada") } }, key)).toBe("山田")
    expect(elementName({ id: "p", name: { ja: text(""), en: text("Yamada") } }, key)).toBe("Yamada")
  })

  it("names anything else nothing", () => {
    for (const element of [null, 3, "x", {}, { id: "p" }, { label: 3 }]) expect(elementName(element, key)).toBe("")
  })
})
