import { describe, expect, it } from "bun:test"

import { isCjk, toPersonDoc } from "@/cau/es-writer"
import type { CanonicalPerson, PersonHumRollup } from "@/cau/types"

const person = (overrides: Partial<CanonicalPerson> = {}): CanonicalPerson => ({
  personId: "P00001",
  enFamily: "",
  enGiven: "",
  jaFamily: "",
  jaGiven: "",
  displayName: "test",
  canonicalEmail: "",
  affiliation: "",
  country: "",
  studyTitle: "",
  studyTitleEn: "",
  orcid: "",
  allEmails: [],
  allAccounts: [],
  role: "member",
  flag: "",
  ...overrides,
})

const rollup = (overrides: Partial<PersonHumRollup> = {}): PersonHumRollup => ({
  isCurrent: true,
  startDate: new Date("2025-01-01"),
  endDate: new Date("2027-03-31"),
  role: "member",
  datasetIds: ["JGAD000001"],
  ...overrides,
})

describe("isCjk", () => {
  it("returns true for CJK string", () => {
    expect(isCjk("佐藤宏征")).toBe(true)
  })

  it("returns false for romaji string", () => {
    expect(isCjk("Sato Jiro")).toBe(false)
  })

  it("returns true for mixed CJK + ASCII", () => {
    expect(isCjk("田中 ABC")).toBe(true)
  })

  it("returns true for hiragana", () => {
    expect(isCjk("さとう")).toBe(true)
  })

  it("returns true for katakana", () => {
    expect(isCjk("サトウ")).toBe(true)
  })

  it("returns false for empty string", () => {
    expect(isCjk("")).toBe(false)
  })
})

describe("toPersonDoc", () => {
  it("maps PI with en + ja names", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ enFamily: "Sato", enGiven: "Jiro", jaFamily: "佐藤", jaGiven: "次郎" }),
    )
    expect(doc.name.en?.text).toBe("Sato Jiro")
    expect(doc.name.ja?.text).toBe("佐藤次郎")
  })

  it("maps member with en only", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ enFamily: "Smith", enGiven: "John" }),
    )
    expect(doc.name.en?.text).toBe("Smith John")
    expect(doc.name.ja?.text).toBe("Smith John")
  })

  it("maps collaborator with CJK displayName to ja", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ displayName: "佐藤宏征" }),
    )
    expect(doc.name.ja?.text).toBe("佐藤宏征")
    expect(doc.name.en?.text).toBe("佐藤宏征")
  })

  it("maps collaborator with romaji displayName to en", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ displayName: "David Monk" }),
    )
    expect(doc.name.en?.text).toBe("David Monk")
    expect(doc.name.ja?.text).toBe("David Monk")
  })

  it("falls back to displayName for en when both are empty", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ displayName: "unknown" }),
    )
    expect(doc.name.en?.text).toBe("unknown")
    expect(doc.name.ja?.text).toBe("unknown")
  })

  it("maps email and orcid", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ canonicalEmail: "sato@example.org", orcid: "0000-0002-3456-7890" }),
    )
    expect(doc.email).toBe("sato@example.org")
    expect(doc.orcid).toBe("0000-0002-3456-7890")
  })

  it("sets email and orcid to null when empty", () => {
    const doc = toPersonDoc(rollup(), person())
    expect(doc.email).toBeNull()
    expect(doc.orcid).toBeNull()
  })

  it("maps organization from affiliation", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ affiliation: "University of Tokyo" }),
    )
    expect(doc.organization?.name.en?.text).toBe("University of Tokyo")
    expect(doc.organization?.name.ja?.text).toBe("University of Tokyo")
    expect(doc.organization?.address).toBeNull()
  })

  it("sets organization to null when no affiliation", () => {
    const doc = toPersonDoc(rollup(), person())
    expect(doc.organization).toBeNull()
  })

  it("maps datasetIds from rollup", () => {
    const doc = toPersonDoc(
      rollup({ datasetIds: ["JGAD000001", "JGAD000002"] }),
      person(),
    )
    expect(doc.datasetIds).toEqual(["JGAD000001", "JGAD000002"])
  })

  it("formats periodOfDataUse dates as YYYY-MM-DD", () => {
    const doc = toPersonDoc(
      rollup({ startDate: new Date("2025-04-01"), endDate: new Date("2027-03-31") }),
      person(),
    )
    expect(doc.periodOfDataUse?.startDate).toBe("2025-04-01")
    expect(doc.periodOfDataUse?.endDate).toBe("2027-03-31")
  })

  it("sets date to null when null in rollup", () => {
    const doc = toPersonDoc(
      rollup({ startDate: null, endDate: null }),
      person(),
    )
    expect(doc.periodOfDataUse?.startDate).toBeNull()
    expect(doc.periodOfDataUse?.endDate).toBeNull()
  })

  it("maps PI with only enFamily (no enGiven)", () => {
    const doc = toPersonDoc(
      rollup(),
      person({ enFamily: "Tanaka" }),
    )
    expect(doc.name.en?.text).toBe("Tanaka")
  })
})
