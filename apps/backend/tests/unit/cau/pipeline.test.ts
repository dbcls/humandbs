import { describe, expect, it } from "bun:test"

import { buildOccurrences, runPipeline } from "@/cau/pipeline"
import { resolvePersons } from "@/cau/resolve"
import type { DuPhaseInfo, RawCore, RawJgad } from "@/cau/types"

const makeCore = (overrides: Partial<RawCore> = {}): RawCore => ({
  jduId: "J-DU000001",
  applId: "1001",
  applVersion: "1",
  status: "60",
  submitDate: "2025-01-01",
  accountGroup: "grp1",
  piAccountId: "acc1",
  piEmail: "pi@example.com",
  piLastEn: "Yamada",
  piFirstEn: "Taro",
  piLastJa: "山田",
  piFirstJa: "太郎",
  piInstEn: "University of Tokyo",
  piCountryEn: "Japan",
  studyTitle: "テスト研究",
  studyTitleEn: "Test Study",
  ...overrides,
})

const makeJgad = (applId: string, jgad: string): RawJgad => ({ applId, jgad })

const makeDuPhase = (overrides: Partial<DuPhaseInfo> = {}): DuPhaseInfo => ({
  phase: "160",
  approvedAt: new Date("2025-01-15"),
  expireDate: new Date("2027-03-31"),
  endedDate: null,
  ...overrides,
})

function run(
  core: RawCore[],
  jgadRows: RawJgad[],
  duPhaseMap: Map<string, DuPhaseInfo>,
  jgadHumMap: Map<string, string>,
) {
  const occs = buildOccurrences(core)
  const resolved = resolvePersons(occs)
  return runPipeline(core, jgadRows, duPhaseMap, jgadHumMap, resolved)
}

describe("runPipeline", () => {
  it("basic flow: 1 DU, 1 PI, 1 JGAD → 1 (person, hum)", () => {
    const core = [makeCore()]
    const jgadRows = [makeJgad("1001", "JGAD000001")]
    const duPhase = new Map([["J-DU000001", makeDuPhase()]])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    expect(result.cauByHum.size).toBe(1)
    const entries = result.cauByHum.get("hum0001")!
    expect(entries).toHaveLength(1)
    expect(entries[0].person.canonicalEmail).toBe("pi@example.com")
    expect(entries[0].rollup.isCurrent).toBe(true)
    expect(entries[0].rollup.datasetIds).toEqual(["JGAD000001"])
    expect(result.stats.currentPairs).toBe(1)
    expect(result.stats.endedPairs).toBe(0)
  })

  it("phase 160 → current, phase 190 → ended", () => {
    const coreA = makeCore({ jduId: "J-DU000001", applId: "1001" })
    const coreB = makeCore({
      jduId: "J-DU000002",
      applId: "1002",
      piEmail: "other@example.com",
      piLastEn: "Suzuki",
      piFirstEn: "Hanako",
    })
    const jgadRows = [makeJgad("1001", "JGAD000001"), makeJgad("1002", "JGAD000002")]
    const duPhase = new Map<string, DuPhaseInfo>([
      ["J-DU000001", makeDuPhase({ phase: "160" })],
      ["J-DU000002", makeDuPhase({ phase: "190", endedDate: new Date("2026-06-01") })],
    ])
    const jgadHumMap = new Map([
      ["JGAD000001", "hum0001"],
      ["JGAD000002", "hum0002"],
    ])

    const result = run([coreA, coreB], jgadRows, duPhase, jgadHumMap)

    const hum1 = result.cauByHum.get("hum0001")!
    expect(hum1[0].rollup.isCurrent).toBe(true)

    const hum2 = result.cauByHum.get("hum0002")!
    expect(hum2[0].rollup.isCurrent).toBe(false)

    expect(result.stats.currentPairs).toBe(1)
    expect(result.stats.endedPairs).toBe(1)
  })

  it("same PI across two DUs merges into one person", () => {
    const coreA = makeCore({ jduId: "J-DU000001", applId: "1001", piEmail: "shared@example.com" })
    const coreB = makeCore({
      jduId: "J-DU000002",
      applId: "1002",
      piEmail: "shared@example.com",
    })
    const jgadRows = [makeJgad("1001", "JGAD000001"), makeJgad("1002", "JGAD000002")]
    const duPhase = new Map<string, DuPhaseInfo>([
      ["J-DU000001", makeDuPhase()],
      ["J-DU000002", makeDuPhase()],
    ])
    const jgadHumMap = new Map([
      ["JGAD000001", "hum0001"],
      ["JGAD000002", "hum0001"],
    ])

    const result = run([coreA, coreB], jgadRows, duPhase, jgadHumMap)

    const entries = result.cauByHum.get("hum0001")!
    const sharedPerson = entries.find(e => e.person.canonicalEmail === "shared@example.com")!
    expect(sharedPerson.rollup.datasetIds).toEqual(["JGAD000001", "JGAD000002"])
  })

  it("multiple JGADs per hum aggregated into datasetIds", () => {
    const core = [makeCore()]
    const jgadRows = [
      makeJgad("1001", "JGAD000001"),
      makeJgad("1001", "JGAD000002"),
      makeJgad("1001", "JGAD000003"),
    ]
    const duPhase = new Map([["J-DU000001", makeDuPhase()]])
    const jgadHumMap = new Map([
      ["JGAD000001", "hum0001"],
      ["JGAD000002", "hum0001"],
      ["JGAD000003", "hum0001"],
    ])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    const entries = result.cauByHum.get("hum0001")!
    expect(entries[0].rollup.datasetIds).toEqual(["JGAD000001", "JGAD000002", "JGAD000003"])
  })

  it("latest approved version determines current grant", () => {
    const v1 = makeCore({ applId: "1001", applVersion: "1", status: "60" })
    const v2 = makeCore({ applId: "1002", applVersion: "2", status: "60" })
    const jgadRows = [
      makeJgad("1001", "JGAD000001"),
      makeJgad("1002", "JGAD000002"),
    ]
    const duPhase = new Map([["J-DU000001", makeDuPhase({ phase: "160" })]])
    const jgadHumMap = new Map([
      ["JGAD000001", "hum0001"],
      ["JGAD000002", "hum0001"],
    ])

    const result = run([v1, v2], jgadRows, duPhase, jgadHumMap)

    const entries = result.cauByHum.get("hum0001")!
    expect(entries[0].rollup.isCurrent).toBe(true)
    expect(entries[0].rollup.datasetIds).toContain("JGAD000001")
    expect(entries[0].rollup.datasetIds).toContain("JGAD000002")
  })

  it("unmapped JGAD excluded from output but counted in stats", () => {
    const core = [makeCore()]
    const jgadRows = [
      makeJgad("1001", "JGAD000001"),
      makeJgad("1001", "JGAD999999"),
    ]
    const duPhase = new Map([["J-DU000001", makeDuPhase()]])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    const entries = result.cauByHum.get("hum0001")!
    expect(entries[0].rollup.datasetIds).toEqual(["JGAD000001"])
    expect(result.stats.unmappedJgad).toBe(1)
  })

  it("excluded persons are not in cauByHum", () => {
    const core = [makeCore({ piEmail: "humandbs+agent@dbcls.jp" })]
    const jgadRows = [makeJgad("1001", "JGAD000001")]
    const duPhase = new Map([["J-DU000001", makeDuPhase()]])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    expect(result.cauByHum.size).toBe(0)
    expect(result.stats.personHumPairs).toBe(1)
    expect(result.stats.currentPairs).toBe(0)
  })

  it("non-approved versions are ignored", () => {
    const core = [makeCore({ status: "10" })]
    const jgadRows = [makeJgad("1001", "JGAD000001")]
    const duPhase = new Map([["J-DU000001", makeDuPhase()]])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    expect(result.cauByHum.size).toBe(0)
    expect(result.stats.personJgadPairs).toBe(0)
  })

  it("out-of-scope phases are ignored", () => {
    const core = [makeCore()]
    const jgadRows = [makeJgad("1001", "JGAD000001")]
    const duPhase = new Map([["J-DU000001", makeDuPhase({ phase: "110" })]])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run(core, jgadRows, duPhase, jgadHumMap)

    expect(result.cauByHum.size).toBe(0)
    expect(result.stats.inScopeDu).toBe(0)
  })

  it("startDate uses earliest approved_at, endDate uses latest expire_date for current", () => {
    const v1 = makeCore({ applId: "1001", applVersion: "1" })
    const v2 = makeCore({ applId: "1002", applVersion: "2" })
    const jgadRows = [makeJgad("1001", "JGAD000001"), makeJgad("1002", "JGAD000001")]
    const duPhase = new Map([
      ["J-DU000001", makeDuPhase({
        phase: "160",
        approvedAt: new Date("2025-01-15"),
        expireDate: new Date("2027-03-31"),
      })],
    ])
    const jgadHumMap = new Map([["JGAD000001", "hum0001"]])

    const result = run([v1, v2], jgadRows, duPhase, jgadHumMap)

    const entries = result.cauByHum.get("hum0001")!
    expect(entries[0].rollup.startDate).toEqual(new Date("2025-01-15"))
    expect(entries[0].rollup.endDate).toEqual(new Date("2027-03-31"))
  })
})
