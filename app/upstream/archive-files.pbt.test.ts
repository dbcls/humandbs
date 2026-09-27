import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { readGeaFileList, readListing, readMetaboBankFileList } from "./archive-files"

/**
 * A file list written from known files must read back as exactly their size
 * and names: every zip counted once as it is, what a zip holds never counted
 * again, and the files that describe the entry never counted at all.
 */
const names = fc.stringMatching(/^[A-Za-z0-9_-]{1,10}\.[a-z0-9]{1,5}$/)
const sizes = fc.nat({ max: 2 ** 45 })
const file = fc.record({ name: names, size: sizes })

const line = (type: string, name: string, size: number) => `${type}\t${name}\t2025-01-01T00:00:00Z\t${size}\tmd5`

describe("a GEA file list", () => {
  it("reads back as the zips' sizes and the names of what they hold", () => {
    fc.assert(fc.property(
      fc.array(file, { maxLength: 3 }),
      fc.array(fc.record({ zip: file, members: fc.array(file, { maxLength: 4 }) }), { maxLength: 4 }),
      (loose, archives) => {
        const text = [
          "#Archive/File\tName\tTime\tSize\tMD5",
          line("File", "E-GEAD-1.idf.txt", 11),
          line("File", "E-GEAD-1.sdrf.txt", 13),
          ...loose.map((one) => line("File", one.name, one.size)),
          ...archives.flatMap((archive) => [
            line("Archive", archive.zip.name, archive.zip.size),
            ...archive.members.map((one) => line("File", one.name, one.size)),
          ]),
        ].join("\n")
        expect(readGeaFileList(text)).toEqual({
          byteCount: [...loose, ...archives.map((archive) => archive.zip)].reduce((sum, one) => sum + one.size, 0),
          names: [
            ...loose.map((one) => one.name),
            ...archives.flatMap((archive) => archive.members.length === 0 ? [archive.zip.name] : archive.members.map((one) => one.name)),
          ],
        })
      },
    ))
  })
})

describe("a MetaboBank file list", () => {
  it("reads back as every data file and none of the IDF and SDRF", () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.constantFrom("raw", "processed", "maf"), file), { maxLength: 8 }), (rows) => {
      const text = [
        "Type\tName\tTime\tSize\tMD5",
        line("IDF", "MTBKS1.idf.txt", 5),
        ...rows.map(([type, one]) => line(type, one.name, one.size)),
        line("SDRF", "MTBKS1.sdrf.txt", 7),
      ].join("\n")
      expect(readMetaboBankFileList(text)).toEqual({
        byteCount: rows.reduce((sum, [, one]) => sum + one.size, 0),
        names: rows.map(([, one]) => one.name),
      })
    }))
  })
})

describe("a directory listing", () => {
  it("reads back as the directories and files it was written with", () => {
    const entries = fc.uniqueArray(fc.stringMatching(/^[A-Za-z0-9_.-]{1,12}$/).filter((name) => !name.startsWith(".")), { maxLength: 10 })
    fc.assert(fc.property(entries, entries, (directories, files) => {
      const html = [
        `<a href="?C=N;O=D">Name</a>`,
        `<a href="/public/ddbj_database/">Parent Directory</a>`,
        ...directories.map((name) => `<a href="${encodeURIComponent(name)}/">${name}/</a>`),
        ...files.map((name) => `<a href="${encodeURIComponent(name)}">${name}</a>`),
      ].join("\n")
      expect(readListing(html)).toEqual({ directories, files })
    }))
  })
})
