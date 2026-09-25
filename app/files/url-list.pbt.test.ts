import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isFileSlug } from "./prefix"
import { fileUrlList } from "./url-list"

/**
 * Each line of the list has to be one whole address, whatever the name it was
 * made from holds: a tool reading it line by line fetches every line it reads.
 */

const ORIGIN = "https://humandbs.example"

const nameArb = fc.array(
  fc.string({ unit: fc.constantFrom("a", "Z", "0", ".", "-", "_", " ", "\t", "#", "?", "%", "説", "(", ")"), minLength: 1, maxLength: 8 }),
  { minLength: 1, maxLength: 3 },
).map((segments) => segments.join("/")).filter(isFileSlug)

describe("fileUrlList", () => {
  it("gives one line per name, with no space in any line, whatever the names hold", () => {
    fc.assert(fc.property(fc.array(nameArb, { maxLength: 6 }), (names) => {
      const lines = fileUrlList(ORIGIN, "hum0014", names).split("\n")

      expect(lines.at(-1)).toBe("")
      expect(lines.slice(0, -1)).toHaveLength(names.length)
      for (const line of lines) expect(line).not.toMatch(/\s/)
    }))
  })

  it("reads back as the name it was made from", () => {
    fc.assert(fc.property(nameArb, (name) => {
      const [line = ""] = fileUrlList(ORIGIN, "hum0014", [name]).split("\n")
      const path = new URL(line).pathname

      expect(path.startsWith("/files/hum0014/")).toBe(true)
      expect(path.slice("/files/hum0014/".length).split("/").map(decodeURIComponent).join("/")).toBe(name)
    }))
  })
})
