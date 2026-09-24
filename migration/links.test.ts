import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { readRelinks, relink, type Relink } from "./links"

const DEAD = "http://trace.ddbj.nig.ac.jp/DRASearch/submission?acc=DRA006622"
const NEW = "https://ddbj.nig.ac.jp/search/entry/sra-submission/DRA006622"
const GONE = "https://www.example.ac.jp/lab/old.html"

const map = new Map<string, Relink>([[DEAD, { action: "replace", to: NEW }], [GONE, { action: "unlink" }]])

describe("relink", () => {
  it("points a span at the new address, and moves words that were the address with it", () => {
    const prose = [[{ text: "DRA006622", href: DEAD }, { text: " / " }, { text: DEAD, href: DEAD }]]
    const { content, used } = relink({ summary: { aims: { ja: { state: "value", value: prose } } } }, map)

    expect(content.summary.aims.ja.value).toEqual([[{ text: "DRA006622", href: NEW }, { text: " / " }, { text: NEW, href: NEW }]])
    expect([...used]).toEqual([DEAD])
  })

  it("keeps a span's words when its link is taken off", () => {
    const { content } = relink([[{ text: "研究室のページ", href: GONE }]], map)

    expect(content).toEqual([[{ text: "研究室のページ" }]])
  })

  it("takes a dead address out of a list of links, and follows a moved one", () => {
    const links = [
      { id: "l1", url: GONE, text: GONE },
      { id: "l2", url: DEAD, text: DEAD },
      { id: "l3", url: "https://alive.example.jp/", text: "https://alive.example.jp/" },
    ]
    const { content } = relink({ url: { ja: { state: "value", value: links } } }, map)

    expect(content.url.ja.value).toEqual([
      { id: "l2", url: NEW, text: NEW },
      { id: "l3", url: "https://alive.example.jp/", text: "https://alive.example.jp/" },
    ])
  })

  it("follows a moved address in a publication's DOI field, and keeps a dead one there", () => {
    const publications = [
      { id: "p1", title: { state: "value", value: "t" }, doi: { state: "value", value: DEAD } },
      { id: "p2", title: { state: "value", value: "t" }, doi: { state: "value", value: GONE } },
    ]
    const { content, used } = relink({ relatedPublications: publications }, map)

    expect(content.relatedPublications.map((one) => one.doi.value)).toEqual([NEW, GONE])
    expect([...used].sort()).toEqual([DEAD, GONE].sort())
  })

  it("changes nothing when no address is in the table", () => {
    const address = fc.webUrl().filter((url) => !map.has(url))
    fc.assert(fc.property(fc.array(fc.tuple(fc.string(), address), { maxLength: 5 }), (spans) => {
      const prose = [spans.map(([text, href]) => ({ text, href }))]
      expect(relink(prose, map)).toEqual({ content: prose, used: new Set() })
    }))
  })
})

describe("readRelinks", () => {
  const header = "url\taction\tnew_url\tevidence"

  it("reads replacements and removals, and leaves live addresses out", () => {
    const table = readRelinks([
      header,
      `${DEAD}\treplace\t${NEW}\tDDBJ Search の同じ entry`,
      `${GONE}\tunlink\t\t移転先なし`,
      "https://alive.example.jp/\tkeep\t\t200",
    ].join("\n"))

    expect(table).toEqual(map)
  })

  it("refuses a table whose rows it cannot read, rather than skipping them", () => {
    expect(() => readRelinks(`${header}\n${DEAD}\treplace\t\tx`)).toThrow(DEAD)
    expect(() => readRelinks(`${header}\n${DEAD}\tmove\t${NEW}\tx`)).toThrow(DEAD)
    expect(() => readRelinks(`${header}\n${GONE}\tunlink\t\ta\n${GONE}\tkeep\t\tb`)).toThrow(/twice/)
    expect(() => readRelinks(`${DEAD}\tunlink\t\tx`)).toThrow(/header/)
  })
})
