import { describe, expect, it } from "vitest"

import { commonFileNames } from "./common-references"

/**
 * Reading the `common/` names out of the JSON text of a stored body.
 *
 * The text is what `content::text` gives back, so a newline in a markdown
 * body arrives as the two characters `\n` and a quote inside a string as `\"`.
 * Those are the cases a pattern that only stops at quotes and brackets reads
 * past, and they are what most of these write down.
 */

describe("commonFileNames", () => {
  it("reads the name out of a markdown link and a markdown image", () => {
    expect(commonFileNames("[名簿](/files/common/dac/list.pdf) ![](/files/common/images/flow.png)"))
      .toEqual(["dac/list.pdf", "images/flow.png"])
  })

  it("reads the name out of a JSON string, as a rich text link holds it", () => {
    expect(commonFileNames(`{"text": "x", "href": "/files/common/faq/a.pdf"}`)).toEqual(["faq/a.pdf"])
  })

  it("ends a bare address at the escaped newline after it", () => {
    expect(commonFileNames(String.raw`"see /files/common/a.pdf\nnext line"`)).toEqual(["a.pdf"])
  })

  it("ends an address at the escaped quote of an HTML attribute", () => {
    expect(commonFileNames(String.raw`"<a href=\"/files/common/a.pdf\">x</a>"`)).toEqual(["a.pdf"])
  })

  it("reads an absolute address the same as a root-relative one", () => {
    expect(commonFileNames("https://humandbs.dbcls.jp/files/common/a.pdf")).toEqual(["a.pdf"])
  })

  it("leaves the query and the fragment out of the name", () => {
    expect(commonFileNames("(/files/common/a.pdf#page=2) (/files/common/b.pdf?download=1)"))
      .toEqual(["a.pdf", "b.pdf"])
  })

  it("unescapes each segment, since the store keeps the name as written", () => {
    expect(commonFileNames("(/files/common/%E8%AA%AC%E6%98%8E/a%20b.pdf)")).toEqual(["説明/a b.pdf"])
  })

  it("keeps a segment as written when its escape is malformed", () => {
    expect(commonFileNames("(/files/common/100%zz.pdf)")).toEqual(["100%zz.pdf"])
  })

  it("reads nothing from the prefix of a research or from a longer word", () => {
    expect(commonFileNames("(/files/hum0001/a.pdf) (/files/commons/a.pdf) (/files/common)")).toEqual([])
  })

  it("reads nothing that is not a file name in the prefix", () => {
    expect(commonFileNames("(/files/common/) (/files/common/dac/) (/files/common/../private/a.pdf)"))
      .toEqual([])
  })

  it("lists a name once however often it is linked, in name order", () => {
    expect(commonFileNames("(/files/common/b.pdf) (/files/common/a.pdf) (/files/common/b.pdf)"))
      .toEqual(["a.pdf", "b.pdf"])
  })

  it("reads nothing from a text with no address", () => {
    expect(commonFileNames("")).toEqual([])
  })
})
