import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { FILE_FORMATS, readFileName, readFileNames } from "./formats"

/**
 * A name is read from its right end, so what is left of the extensions — the
 * directory, the case, the stem, dots inside the stem — must never change the
 * reading, and JGA's `.encrypt` and one compression must be seen through.
 */
const KNOWN = FILE_FORMATS.flatMap((one) => one.extensions.map((extension) => ({ extension, code: one.code })))
const COMPRESSIONS = ["gz", "bz2", "zip"]
const LISTED = new Set(KNOWN.map((one) => one.extension))

const stems = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}(?:\.[A-Za-z0-9_-]{1,6}){0,3}$/)
const known = fc.constantFrom(...KNOWN)
const words = fc.stringMatching(/^[a-z0-9]{1,6}$/).filter((word) => word !== "encrypt")
const unknownWords = words.filter((word) => !LISTED.has(word))
const directories = fc.array(fc.stringMatching(/^[A-Za-z0-9_.-]{1,8}$/), { maxLength: 3 }).map((parts) => parts.join("/"))

describe("reading a file name", () => {
  it("does not depend on the directory the name is in", () => {
    fc.assert(fc.property(directories, stems, words, (directory, stem, extension) => {
      const name = `${stem}.${extension}`
      expect(readFileName(`${directory}/${name}`)).toEqual(readFileName(name))
    }))
  })

  it("does not depend on case", () => {
    fc.assert(fc.property(stems, words, (stem, extension) => {
      const name = `${stem}.${extension}`
      expect(readFileName(name.toUpperCase())).toEqual(readFileName(name.toLowerCase()))
    }))
  })

  it("reads every listed extension as its format, whatever the stem", () => {
    fc.assert(fc.property(stems, known, (stem, { extension, code }) => {
      expect(readFileName(`${stem}.${extension}`)).toEqual({ format: code })
    }))
  })

  it("sees through JGA's encryption", () => {
    fc.assert(fc.property(stems, words, (stem, extension) => {
      const name = `${stem}.${extension}`
      expect(readFileName(`${name}.encrypt`)).toEqual(readFileName(name))
    }))
  })

  it("reads a compressed file of a listed format as that format", () => {
    fc.assert(fc.property(stems, known, fc.constantFrom(...COMPRESSIONS), (stem, { extension, code }, compression) => {
      expect(readFileName(`${stem}.${extension}.${compression}`)).toEqual({ format: code })
      expect(readFileName(`${stem}.${extension}.${compression}.encrypt`)).toEqual({ format: code })
    }))
  })

  it("reads a compressed file of an unlisted inside as the compression", () => {
    fc.assert(fc.property(stems, unknownWords, fc.constantFrom(...COMPRESSIONS), (stem, inside, compression) => {
      expect(readFileName(`${stem}.${inside}.${compression}`)).toEqual(readFileName(`x.${compression}`))
    }))
  })

  it("makes a format only of the list, and reports only extensions the list does not have", () => {
    const codes = new Set(FILE_FORMATS.map((one) => one.code))
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (name) => {
      const reading = readFileName(name)
      if (reading.format !== null) expect(codes.has(reading.format)).toBe(true)
      else expect(LISTED.has(reading.extension)).toBe(false)
    }))
  })
})

describe("reading many names", () => {
  it("has each format one of the names has, and counts every name that made none", () => {
    fc.assert(fc.property(fc.array(fc.tuple(stems, fc.oneof(words, known.map((one) => one.extension))), { maxLength: 30 }), (pairs) => {
      const names = pairs.map(([stem, extension]) => `${stem}.${extension}`)
      const each = names.map((name) => readFileName(name))
      const reading = readFileNames(names)
      expect(new Set(reading.formats)).toEqual(new Set(each.flatMap((one) => one.format === null ? [] : [one.format])))
      expect(reading.formats.length).toBe(new Set(reading.formats).size)
      expect([...reading.unknown.values()].reduce((sum, n) => sum + n, 0)).toBe(each.filter((one) => one.format === null).length)
    }))
  })
})
