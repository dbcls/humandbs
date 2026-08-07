import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { researchContentArb } from "~/content/arbitraries/content"
import type { ResearchContent } from "~/content/types"

import { researchContentInput } from "./form"
import { researchContentOf } from "./form.server"

/** A content the save path accepted, or nothing when it refused the prose. */
function through(content: ResearchContent): ResearchContent | null {
  const result = researchContentOf(researchContentInput(content))
  return result.ok ? result.content : null
}

/** The state of every slot, flattened, in a fixed order. */
function states(content: ResearchContent): string[] {
  return JSON.stringify(content).match(/"state":"[a-z-]+"/g) ?? []
}

describe("the trip through the editor", () => {
  it("gives back the same content when content it produced is saved again unchanged", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(through(once)).toEqual(once)
    }))
  })

  it("keeps every slot's state, in both languages, across one trip", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(states(once)).toEqual(states(content))
    }))
  })

  it("keeps the identity and the order of every array across one trip", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
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

  it("never lets a slot that holds no value carry a value across", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      for (const match of JSON.stringify(once).matchAll(/\{"state":"(unknown|not-applicable)"[^}]*/g)) {
        expect(match[0]).toBe(`{"state":"${match[1] ?? ""}"`)
      }
    }))
  })
})
