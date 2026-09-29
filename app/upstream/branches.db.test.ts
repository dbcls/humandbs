import fc from "fast-check"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import type { DsBranchDetail } from "./application-db.server"
import {
  branchesFetched,
  branchOfAccession,
  readBranch,
  readJgadRegistrations,
  searchBranches,
} from "./branches.server"

/**
 * Reading the cached branches, which is all the seeding screens see of the
 * application system. The listing's keyword has to find what the row shows,
 * and nothing a curator typed may be read as a pattern.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

function branch(overrides: Partial<DsBranchDetail> = {}): DsBranchDetail {
  return {
    applicationId: "J-DS000136-010",
    humLabel: "hum0522",
    applicationType: "new",
    approvedOn: "2024-05-18",
    titleJa: "ゲノム解析",
    titleEn: "A genome study",
    piNameJa: "田中 太郎",
    piNameEn: "Taro Tanaka",
    accessions: ["JGAD000891", "JGAS000720"],
    aimsJa: "",
    aimsEn: "",
    methodsJa: "",
    methodsEn: "",
    targetsJa: "",
    targetsEn: "",
    affiliationJa: "",
    affiliationEn: "",
    country: "",
    dataAccess: null,
    icd10: "",
    ...overrides,
  }
}

describe("branchesFetched", () => {
  it("is false until the branches have been fetched once, and stays true through later failures", async () => {
    expect(await branchesFetched(db)).toBe(false)

    await db.insert(s.upstreamRefresh).values({ source: "ds-branch", attemptedAt: new Date(), failure: "refused" })
    expect(await branchesFetched(db)).toBe(false)

    await db.update(s.upstreamRefresh).set({ succeededAt: new Date(), failure: null })
    await db.update(s.upstreamRefresh).set({ failure: "refused" })
    expect(await branchesFetched(db)).toBe(true)
  })

  it("does not take another source's success for the branches'", async () => {
    await db.insert(s.upstreamRefresh).values({ source: "cau", attemptedAt: new Date(), succeededAt: new Date() })

    expect(await branchesFetched(db)).toBe(false)
  })
})

describe("searchBranches", () => {
  beforeEach(async () => {
    await db.insert(s.dsBranch).values([
      branch(),
      branch({
        applicationId: "J-DS000200-001",
        humLabel: null,
        approvedOn: "2025-01-10",
        titleJa: "がんの研究",
        titleEn: "Cancer 100% study",
        piNameJa: "山田 花子",
        piNameEn: "Hanako Yamada",
      }),
      branch({ applicationId: "J-DS000300-001", humLabel: "hum0600", approvedOn: null, titleEn: "under_score", piNameJa: "佐藤 一郎", piNameEn: "Ichiro Sato" }),
    ])
  })

  const found = async (keyword: string) => (await searchBranches(db, keyword)).map((row) => row.applicationId)

  it("returns every branch for an empty keyword, the newest approval first and the undated last", async () => {
    expect(await found("")).toEqual(["J-DS000200-001", "J-DS000136-010", "J-DS000300-001"])
    expect(await found("  ")).toEqual(await found(""))
  })

  it("matches the application ID, the hum label, both titles and both names, whatever the case", async () => {
    expect(await found("j-ds000136")).toEqual(["J-DS000136-010"])
    expect(await found("HUM0600")).toEqual(["J-DS000300-001"])
    expect(await found("がん")).toEqual(["J-DS000200-001"])
    expect(await found("genome")).toEqual(["J-DS000136-010"])
    expect(await found("山田")).toEqual(["J-DS000200-001"])
    expect(await found("hanako yamada")).toEqual(["J-DS000200-001"])
  })

  it("matches the Japanese name typed with or without the space between the names", async () => {
    expect(await found("田中太郎")).toEqual(["J-DS000136-010"])
    expect(await found("田中 太郎")).toEqual(["J-DS000136-010"])
  })

  it("reads % and _ as the characters themselves", async () => {
    expect(await found("100%")).toEqual(["J-DS000200-001"])
    expect(await found("%")).toEqual(["J-DS000200-001"])
    expect(await found("_")).toEqual(["J-DS000300-001"])
    expect(await found("\\")).toEqual([])
  })

  it("finds a branch by any part of its title and by nothing it does not contain", async () => {
    const title = "Cancer 100% study"
    await fc.assert(fc.asyncProperty(
      fc.nat(title.length - 1).chain((from) => fc.tuple(fc.constant(from), fc.integer({ min: from + 1, max: title.length }))),
      async ([from, to]) => {
        const part = title.slice(from, to)
        if (part.trim() === "") return
        expect(await found(part)).toContain("J-DS000200-001")
      },
    ), { numRuns: 30 })
    await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 8 }), async (keyword) => {
      const rows = await searchBranches(db, keyword)
      const wanted = keyword.trim().toLowerCase()
      for (const row of rows) {
        const shown = [row.applicationId, row.humLabel ?? "", row.titleJa, row.titleEn, row.piNameJa, row.piNameJa.replaceAll(" ", ""), row.piNameEn]
        expect(shown.some((value) => value.toLowerCase().includes(wanted)), `${keyword} -> ${row.applicationId}`).toBe(true)
      }
    }), { numRuns: 50 })
  })
})

describe("readBranch", () => {
  it("returns the branch with everything a draft takes, and null for one not fetched", async () => {
    await db.insert(s.dsBranch).values(branch({ aimsJa: "目的", dataAccess: 4, icd10: "C34.9" }))

    expect(await readBranch(db, "J-DS000136-010")).toEqual(branch({ aimsJa: "目的", dataAccess: 4, icd10: "C34.9" }))
    expect(await readBranch(db, "J-DS000136-011")).toBeNull()
  })
})

describe("branchOfAccession", () => {
  it("names the one branch that registered an accession", async () => {
    await db.insert(s.dsBranch).values([branch(), branch({ applicationId: "J-DS000200-001", accessions: ["JGAD000892"] })])

    expect(await branchOfAccession(db, "JGAD000892")).toBe("J-DS000200-001")
    expect(await branchOfAccession(db, "JGAS000720")).toBe("J-DS000136-010")
  })

  it("names none for an accession no branch registered, or that two branches did", async () => {
    await db.insert(s.dsBranch).values([branch(), branch({ applicationId: "J-DS000136-011" })])

    expect(await branchOfAccession(db, "JGAD000891")).toBeNull()
    expect(await branchOfAccession(db, "JGAD000999")).toBeNull()
    expect(await branchOfAccession(db, "")).toBeNull()
  })
})

describe("readJgadRegistrations", () => {
  it("returns the registrations asked for that were fetched, in accession order", async () => {
    await db.insert(s.jgadRegistration).values([
      { accession: "JGAD000892", title: "B", datasetType: "WES" },
      { accession: "JGAD000891", title: "A", datasetType: "" },
      { accession: "JGAD000900", title: "C", datasetType: "WGS" },
    ])

    expect(await readJgadRegistrations(db, ["JGAD000892", "JGAD000891", "JGAD000999"])).toEqual([
      { accession: "JGAD000891", title: "A", datasetType: "" },
      { accession: "JGAD000892", title: "B", datasetType: "WES" },
    ])
    expect(await readJgadRegistrations(db, [])).toEqual([])
  })
})
