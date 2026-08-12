import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { DatasetContent } from "~/content/types"

import { CANONICAL_UNITS, datasetContentForEditorArb } from "./arbitraries/draft"
import { datasetContentInput } from "./dataset-form"
import { datasetContentOf } from "./dataset-form.server"

/** A content the save path accepted, or nothing when it refused the prose. */
function through(content: DatasetContent): DatasetContent | null {
  const result = datasetContentOf(datasetContentInput(content), CANONICAL_UNITS)
  return result.ok ? result.content : null
}

/** The state of every slot, flattened, in a fixed order. */
function states(content: DatasetContent): string[] {
  return JSON.stringify(content).match(/"state":"[a-z-]+"/g) ?? []
}

describe("the trip a dataset takes through the editor", () => {
  it("gives back the same content when content it produced is saved again unchanged", () => {
    fc.assert(fc.property(datasetContentForEditorArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(through(once)).toEqual(once)
    }))
  })

  it("keeps every slot's state, in both languages, across one trip", () => {
    fc.assert(fc.property(datasetContentForEditorArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(states(once)).toEqual(states(content))
    }))
  })

  it("keeps the identity and the order of the experiments and their keys", () => {
    fc.assert(fc.property(datasetContentForEditorArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(once.experiments.map((row) => row.id)).toEqual(content.experiments.map((row) => row.id))
      expect(once.experiments.map((row) => row.values.map((value) => value.keyId)))
        .toEqual(content.experiments.map((row) => row.values.map((value) => value.keyId)))
      expect(once.values.map((value) => value.keyId))
        .toEqual(content.values.map((value) => value.keyId))
    }))
  })

  it("never lets a slot that holds no value carry a value across", () => {
    fc.assert(fc.property(datasetContentForEditorArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      for (const match of JSON.stringify(once).matchAll(/\{"state":"(unknown|not-applicable)"[^}]*/g)) {
        expect(match[0]).toBe(`{"state":"${match[1] ?? ""}"`)
      }
    }))
  })

  it("carries the file selection through a screen that does not show it", () => {
    fc.assert(fc.property(datasetContentForEditorArb, (content) => {
      const once = through(content)
      fc.pre(once !== null)
      expect(once.fileSelection).toEqual(content.fileSelection)
    }))
  })
})
