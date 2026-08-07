import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInputArb } from "./arbitraries/draft"
import { diffDatasetInput, takeDatasetField } from "./dataset-diff"

/**
 * The diff and the taking of a field share one path vocabulary and nothing in
 * the type system says so: the diff names paths, the take walks a structure,
 * and a disagreement between them would leave a field that says it changed and
 * cannot be taken. **This law is the only thing that ties them together.**
 */
describe("the conflict diff over a dataset", () => {
  it("leaves nothing to report once every field it reported has been taken", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (mine, theirs) => {
      const taken = diffDatasetInput(mine, theirs)
        .reduce((into, path) => takeDatasetField(into, theirs, path), mine)

      expect(diffDatasetInput(taken, theirs)).toEqual([])
    }))
  })

  it("reports nothing between a version and itself", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      expect(diffDatasetInput(input, input)).toEqual([])
    }))
  })

  it("does not see the text a slot kept behind a state that says there is no value", () => {
    fc.assert(fc.property(datasetContentInputArb, fc.string(), (input, leftover) => {
      const hidden = {
        ...input,
        values: input.values.map((slot) =>
          slot.value.kind === "text"
            ? {
                ...slot,
                value: {
                  ...slot.value,
                  text: {
                    ja: slot.value.text.ja.state === "value"
                      ? slot.value.text.ja
                      : { ...slot.value.text.ja, text: leftover },
                    en: slot.value.text.en,
                  },
                },
              }
            : slot),
      }

      expect(diffDatasetInput(input, hidden)).toEqual([])
    }))
  })

  it("names a slot only one side carries as a change to the list, not to the slot", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      fc.pre(input.values.length > 0)
      const dropped = { ...input, values: input.values.slice(1) }
      const paths = diffDatasetInput(input, dropped)

      expect(paths).toContain("values")
      expect(paths.some((path) => path.startsWith("values."))).toBe(false)
    }))
  })
})
