import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { emptyResearchContent } from "~/content/empty"

import { draftInputArb } from "./arbitraries/draft"
import { diffDraftInput } from "./diff"
import { researchContentInput, type DraftInput } from "./form"
import { readAt } from "./paths"
import { heldIds, initialImport, isList, listRows, RESEARCH_IMPORT, importFieldPaths, withElement } from "./import"

const shape = RESEARCH_IMPORT

/** Whether a value holds a slot that is a value with nothing in it, anywhere inside. */
function hasBlank(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0 || value.some(hasBlank)
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  if (record.state === "value" && typeof record.text === "string" && record.text.trim() === "") return true
  if (record.state === "value" && Array.isArray(record.links) && record.links.length === 0) return true
  return Object.values(record).some(hasBlank)
}

const LISTS = ["dataProviders", "researchProjects", "grants", "relatedPublications", "listingSummary.dataProviders"]

/**
 * The form opens holding a value the curator then edits, so what it opens with
 * is the part that can quietly lose work. These are the laws that say it does
 * not: it moves only what the two disagree about, it never drops an element
 * the draft holds, and from nothing it opens holding the source.
 */
describe("what the import form opens holding", () => {
  it("is the draft itself when the source has the same content", () => {
    fc.assert(fc.property(draftInputArb, (mine) => {
      expect(initialImport(shape, mine, mine)).toEqual(mine)
    }))
  })

  it("moves nothing outside the places the form shows", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      const places = importFieldPaths(shape, mine, theirs)
      const written = initialImport(shape, mine, theirs)

      for (const path of diffDraftInput(mine, written)) expect(places).toContain(path)
    }))
  })

  it("keeps every element the draft holds in every list", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      const written = initialImport(shape, mine, theirs)

      for (const path of LISTS) {
        const kept = heldIds(shape, written, path)
        for (const id of heldIds(shape, mine, path)) expect(kept).toContain(id)
      }
    }))
  })

  it("holds the source everywhere the form shows, starting from an empty draft", () => {
    const empty: DraftInput = { content: researchContentInput(emptyResearchContent()) }
    fc.assert(fc.property(draftInputArb, (theirs) => {
      const written = initialImport(shape, empty, theirs)

      // What is left is only where the source itself leaves a blank, which
      // the form fills from the draft — here the empty draft's own blank.
      for (const path of importFieldPaths(shape, written, theirs)) {
        expect(hasBlank(readAt(theirs, shape.keysOf(path)).value)).toBe(true)
      }
    }))
  })

  it("offers nothing the draft decides elsewhere", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, (mine, theirs) => {
      expect(importFieldPaths(shape, mine, theirs)).not.toContain("datasetIds")
      expect(initialImport(shape, mine, theirs).content.datasetIds).toEqual(mine.content.datasetIds)
    }))
  })
})

describe("ticking an element of a list", () => {
  it("out and back in leaves the written value as it was", () => {
    fc.assert(fc.property(draftInputArb, draftInputArb, fc.nat(), (mine, theirs, pick) => {
      const written = initialImport(shape, mine, theirs)
      for (const path of LISTS) {
        if (!isList(shape, mine, theirs, path)) continue
        const rows = listRows(shape, mine, theirs, path)
        const row = rows[pick % rows.length]
        if (row === undefined) continue

        const out = withElement(shape, written, written, rows, path, row.id, false)
        expect(heldIds(shape, out, path)).not.toContain(row.id)
        expect(withElement(shape, out, written, rows, path, row.id, true)).toEqual(written)
      }
    }))
  })
})
