import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { searchTextOf } from "./text"

describe("searchTextOf", () => {
  it("never invents a string that is not in the content", () => {
    const leaf = fc.string({ minLength: 1 })
    const content = fc.letrec((tie) => ({
      node: fc.oneof(
        { depthSize: "small" },
        leaf,
        fc.record({ ja: leaf, en: leaf }),
        fc.array(tie("node")),
        fc.dictionary(fc.string({ minLength: 1 }), tie("node")),
      ),
    })).node
    fc.assert(fc.property(content, (value) => {
      const seen: string[] = []
      const collect = (node: unknown): void => {
        if (typeof node === "string") seen.push(node)
        else if (Array.isArray(node)) node.forEach(collect)
        else if (node && typeof node === "object") Object.values(node).forEach(collect)
      }
      collect(value)
      const text = searchTextOf(value)
      for (const word of [...text.ja.split(" "), ...text.en.split(" ")]) {
        if (word === "") continue
        expect(seen.some((s) => s.split(" ").includes(word))).toBe(true)
      }
    }))
  })
})
