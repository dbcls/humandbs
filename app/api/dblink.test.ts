import { describe, expect, it } from "vitest"

import { isAccessionType, linksBySubject, linksOfSubject, type Edge } from "./dblink"

const ORIGIN = "https://humandbs.dbcls.jp"

const EDGES: Edge[] = [
  { accession: "JGAS000002", type: "jga-study", humLabel: "hum0001" },
  { accession: "JGAD000002", type: "jga-dataset", humLabel: "hum0001" },
  { accession: "JGAD000001", type: "jga-dataset", humLabel: "hum0004" },
]

describe("the correspondence read from one side", () => {
  it("groups by the subject and orders subjects and references deterministically", () => {
    const rows = linksBySubject(EDGES, "humandbs", ORIGIN)
    expect(rows.map((row) => row.identifier)).toEqual(["hum0001", "hum0004"])
    expect(rows[0]?.dbXrefs.map((xref) => xref.identifier)).toEqual(["JGAD000002", "JGAS000002"])
  })

  it("turns round when the subject is the other side", () => {
    const rows = linksBySubject(EDGES, "jga-dataset", ORIGIN)
    expect(rows).toEqual([
      {
        identifier: "JGAD000001",
        type: "jga-dataset",
        dbXrefs: [{
          identifier: "hum0004",
          type: "humandbs",
          url: `${ORIGIN}/hum0004`,
        }],
      },
      {
        identifier: "JGAD000002",
        type: "jga-dataset",
        dbXrefs: [{
          identifier: "hum0001",
          type: "humandbs",
          url: `${ORIGIN}/hum0001`,
        }],
      },
    ])
  })

  it("leaves out the accessions of the other kind when one kind is the subject", () => {
    expect(linksBySubject(EDGES, "jga-study", ORIGIN).map((row) => row.identifier))
      .toEqual(["JGAS000002"])
  })

  it("addresses a hum label bare, which is the address DDBJ Search already builds", () => {
    const [row] = linksBySubject(EDGES, "jga-dataset", ORIGIN)
    expect(row?.dbXrefs[0]?.url).toBe(`${ORIGIN}/hum0004`)
  })

  it("addresses a JGA accession at its entry in DDBJ Search", () => {
    const [row] = linksBySubject(EDGES, "humandbs", ORIGIN)
    expect(row?.dbXrefs[1]?.url)
      .toBe("https://ddbj.nig.ac.jp/search/entry/jga-study/JGAS000002")
  })
})

describe("an accession nobody knows", () => {
  it("answers with an empty list rather than with nothing at all", () => {
    expect(linksOfSubject(EDGES, "jga-dataset", "JGAD999999", ORIGIN)).toEqual({
      identifier: "JGAD999999",
      type: "jga-dataset",
      dbXrefs: [],
    })
  })

  it("answers the same as an accession whose research is not published", () => {
    // Only the echoed identifier differs, and that is what was asked for; there
    // is nothing in the answer that says whether the accession exists.
    const published = EDGES.filter((edge) => edge.humLabel !== "hum0004")
    const unpublished = linksOfSubject(published, "jga-dataset", "JGAD000001", ORIGIN)
    const absent = linksOfSubject(published, "jga-dataset", "JGAD999999", ORIGIN)
    expect(unpublished.dbXrefs).toEqual(absent.dbXrefs)
    expect(unpublished.type).toEqual(absent.type)
  })
})

describe("the accession types", () => {
  it("admits the three the correspondence covers and refuses anything else", () => {
    expect(isAccessionType("humandbs")).toBe(true)
    expect(isAccessionType("jga-dataset")).toBe(true)
    expect(isAccessionType("jga-study")).toBe(true)
    expect(isAccessionType("bioproject")).toBe(false)
    expect(isAccessionType("")).toBe(false)
  })
})
