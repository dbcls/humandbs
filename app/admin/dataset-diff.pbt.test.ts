import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { datasetContentInputArb } from "./arbitraries/draft"
import { diffDatasetInput, importDatasetField } from "./dataset-diff"

/**
 * The diff and the taking of a field share one path vocabulary and nothing in
 * the type system enforces it: the diff names paths, the import walks a structure,
 * and a disagreement between them would leave a field that is marked as changed and
 * cannot be taken. **This law is the only thing that ties them together.**
 */
describe("the conflict diff over a dataset", () => {
  it("leaves nothing to report once every field it reported has been taken", () => {
    fc.assert(fc.property(datasetContentInputArb, datasetContentInputArb, (mine, theirs) => {
      const taken = diffDatasetInput(mine, theirs)
        .reduce((into, path) => importDatasetField(into, theirs, path), mine)

      expect(diffDatasetInput(taken, theirs)).toEqual([])
    }))
  })

  it("reads the file selection as a set: the same files in another order are no change", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      const turned = { ...input, fileSelection: input.fileSelection.toReversed() }
      expect(diffDatasetInput(input, turned)).toEqual([])
    }))
  })

  it("reports the file selection when one side chose a file the other did not", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      const more = { ...input, fileSelection: [...input.fileSelection, "\u0000added"] }
      expect(diffDatasetInput(input, more)).toContain("fileSelection")
    }))
  })

  it("reports nothing between a version and itself", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      expect(diffDatasetInput(input, input)).toEqual([])
    }))
  })

  it("does not see the text a slot kept behind a state that indicates there is no value", () => {
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

  it("names a slot only one side has as a change to the list, not to the slot", () => {
    fc.assert(fc.property(datasetContentInputArb, (input) => {
      fc.pre(input.values.length > 0)
      const dropped = { ...input, values: input.values.slice(1) }
      const paths = diffDatasetInput(input, dropped)

      expect(paths).toContain("values")
      expect(paths.some((path) => path.startsWith("values."))).toBe(false)
    }))
  })
})
