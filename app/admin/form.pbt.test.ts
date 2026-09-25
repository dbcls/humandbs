import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { researchContentArb } from "~/content/arbitraries/content"
import type { ResearchContent } from "~/content/types"

import { researchContentInput } from "./form"
import { researchContentOf, typedIds } from "./form.server"

/** A content after one trip through the editor's form and the save path. */
function through(content: ResearchContent): ResearchContent {
  return researchContentOf(researchContentInput(content))
}

/** The state of every slot, flattened, in a fixed order. */
function states(content: ResearchContent): string[] {
  return JSON.stringify(content).match(/"state":"[a-z-]+"/g) ?? []
}

describe("the trip through the editor", () => {
  it("gives back the same content when content it produced is saved again unchanged", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      expect(through(once)).toEqual(once)
    }))
  })

  it("keeps every slot's state, in both languages, across one trip", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      expect(states(once)).toEqual(states(content))
    }))
  })

  it("keeps the identity and the order of every array across one trip", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      expect(once.dataProviders.map((row) => row.id))
        .toEqual(content.dataProviders.map((row) => row.id))
      expect(once.researchProjects.map((row) => row.id))
        .toEqual(content.researchProjects.map((row) => row.id))
      expect(once.grants.map((row) => row.id)).toEqual(content.grants.map((row) => row.id))
      expect(once.relatedPublications.map((row) => row.id))
        .toEqual(content.relatedPublications.map((row) => row.id))
      expect(once.datasetIds).toEqual(content.datasetIds)
    }))
  })

  it("never lets a slot that holds no value pass a value across", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      for (const match of JSON.stringify(once).matchAll(/\{"state":"(unknown|not-applicable)"[^}]*/g)) {
        expect(match[0]).toBe(`{"state":"${match[1] ?? ""}"`)
      }
    }))
  })
})

describe("the IDs typed into a publication's list", () => {
  const typed = fc.array(fc.oneof(fc.constantFrom("", " ", "JGAD000001", " JGAD000001 ", "DRA000002"), fc.string()), { maxLength: 8 })

  it("keeps each non-blank ID once, trimmed, in the order first written", () => {
    fc.assert(fc.property(typed, (rows) => {
      const kept = typedIds(rows)
      const expected = [...new Set(rows.map((row) => row.trim()).filter((row) => row !== ""))]
      expect(kept).toEqual(expected)
      expect(kept.every((id) => id === id.trim() && id !== "")).toBe(true)
      expect(new Set(kept).size).toBe(kept.length)
    }))
  })

  it("is settled after one pass", () => {
    fc.assert(fc.property(typed, (rows) => {
      expect(typedIds(typedIds(rows))).toEqual(typedIds(rows))
    }))
  })
})
