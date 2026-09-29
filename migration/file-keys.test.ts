import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { withoutKeys } from "./file-keys"

const value = (keyId: string) => ({ keyId, value: { kind: "text" } })

describe("withoutKeys", () => {
  it("takes the values of the given keys out of every experiment and counts them", () => {
    const content = {
      datasetId: "d1",
      experiments: [
        { id: "experiment-1", values: [value("jga"), value("materials"), value("dra")] },
        { id: "experiment-2", values: [value("materials")] },
      ],
    }
    const { content: out, dropped } = withoutKeys(content, new Set(["jga", "dra"]))

    expect(dropped).toBe(2)
    expect(out).toEqual({
      datasetId: "d1",
      experiments: [
        { id: "experiment-1", values: [value("materials")] },
        { id: "experiment-2", values: [value("materials")] },
      ],
    })
  })

  it("returns the description itself where it holds none of the keys", () => {
    const content = { experiments: [{ values: [value("materials")] }] }

    expect(withoutKeys(content, new Set(["jga"]))).toEqual({ content, dropped: 0 })
    expect(withoutKeys(content, new Set(["jga"])).content).toBe(content)
  })

  it("leaves a description with no experiments as it is", () => {
    const content: { datasetId: string, experiments?: { values: { keyId: string }[] }[] } = { datasetId: "d1" }

    expect(withoutKeys(content, new Set(["jga"]))).toEqual({ content, dropped: 0 })
  })

  it("keeps every other value, in order, and no value of the given keys", () => {
    const keys = fc.constantFrom("a", "b", "c", "d")
    fc.assert(fc.property(
      fc.array(fc.array(keys), { maxLength: 5 }),
      fc.subarray(["a", "b", "c", "d"]),
      (experiments, dropping) => {
        const content = { experiments: experiments.map((ids) => ({ values: ids.map(value) })) }
        const gone = new Set(dropping)
        const { content: out, dropped } = withoutKeys(content, gone)

        expect(out.experiments.map((one) => one.values.map((v) => v.keyId)))
          .toEqual(experiments.map((ids) => ids.filter((id) => !gone.has(id))))
        expect(dropped).toBe(experiments.flat().filter((id) => gone.has(id)).length)
      },
    ))
  })
})
