import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { filePath } from "~/public/urls"

import { commonFileNames } from "./common-references"
import { isFileSlug } from "./prefix"

/**
 * The address the files screen gives out for a `common/` file is read back as
 * that file's name, wherever a body writes it.
 *
 * The names leave out the characters `encodeURIComponent` does not escape and
 * that also end an address in running text (`'`, `(`, `)`): a name with one of
 * them is written unescaped into the address, and there is no telling it apart
 * from the end of a markdown link.
 */

const segmentArb = fc.string({
  unit: fc.constantFrom("a", "Z", "0", "-", "_", ".", "~", "!", "*", "%", " ", "#", "?", "&", "説", "明", "表"),
  minLength: 1,
  maxLength: 8,
})

const nameArb = fc.array(segmentArb, { minLength: 1, maxLength: 3 })
  .map((segments) => segments.join("/"))
  .filter(isFileSlug)

const contextArb = fc.constantFrom<(address: string) => string>(
  (address) => `[x](${address})`,
  (address) => `![](${address})`,
  (address) => `{"href": "${address}"}`,
  (address) => String.raw`"see ${address}\nnext"`,
  (address) => `https://humandbs.dbcls.jp${address} and more`,
  (address) => `(${address}#page=2)`,
)

describe("commonFileNames", () => {
  it("reads the address of a file back as its name", () => {
    fc.assert(fc.property(nameArb, contextArb, (name, context) => {
      expect(commonFileNames(context(filePath("common", name)))).toEqual([name])
    }))
  })

  it("reads every address in a text, each name once and in name order", () => {
    fc.assert(fc.property(fc.array(nameArb, { minLength: 1, maxLength: 5 }), (names) => {
      const text = names.map((name) => `[x](${filePath("common", name)})`).join("\\n")

      expect(commonFileNames(text)).toEqual([...new Set(names)].sort())
    }))
  })
})
