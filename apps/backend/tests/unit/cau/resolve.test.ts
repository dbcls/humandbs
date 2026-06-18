import { describe, expect, it } from "bun:test"

import {
  isExcluded,
  normalizeEmail,
  normalizeNameTokens,
  resolvePersons,
  samePerson,
} from "@/cau/resolve"
import type { Occurrence } from "@/cau/types"

const occ = (overrides: Partial<Occurrence>): Occurrence => ({
  applId: "1",
  role: "member",
  accountId: "",
  email: "",
  orcid: "",
  eradid: "",
  tokens: [],
  institution: "",
  institutionLower: "",
  enFamily: "",
  enGiven: "",
  jaFamily: "",
  jaGiven: "",
  displayName: "test",
  country: "",
  studyTitle: "",
  studyTitleEn: "",
  submitDate: "2025-01-01",
  jduId: "J-DU000001",
  ...overrides,
})

describe("normalizeNameTokens", () => {
  it("lowercases and sorts", () => {
    expect(normalizeNameTokens("Yamada", "Taro")).toEqual(["taro", "yamada"])
  })

  it("strips accents", () => {
    expect(normalizeNameTokens("José")).toEqual(["jose"])
  })

  it("applies NFKC normalization", () => {
    expect(normalizeNameTokens("Ｔａｒｏ")).toEqual(["taro"])
  })

  it("removes punctuation (comma, period, semicolon)", () => {
    expect(normalizeNameTokens("Monk, David.")).toEqual(["david", "monk"])
  })

  it("deduplicates tokens", () => {
    expect(normalizeNameTokens("taro", "Taro")).toEqual(["taro"])
  })

  it("handles empty input", () => {
    expect(normalizeNameTokens("", "")).toEqual([])
    expect(normalizeNameTokens()).toEqual([])
  })

  it("splits on whitespace", () => {
    expect(normalizeNameTokens("John  Paul   Smith")).toEqual([
      "john",
      "paul",
      "smith",
    ])
  })
})

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com")
  })

  it("returns empty string if no @", () => {
    expect(normalizeEmail("notanemail")).toBe("")
    expect(normalizeEmail("")).toBe("")
  })
})

describe("samePerson", () => {
  it("returns true for identical tokens", () => {
    expect(samePerson(["taro", "yamada"], ["taro", "yamada"])).toBe(true)
  })

  it("returns true when one is subset of other", () => {
    expect(samePerson(["keiki"], ["keiki", "nagaharu"])).toBe(true)
    expect(samePerson(["keiki", "nagaharu"], ["keiki"])).toBe(true)
  })

  it("returns true for initials matching", () => {
    expect(samePerson(["b", "c"], ["bo", "cheng"])).toBe(true)
  })

  it("returns false for disjoint names", () => {
    expect(samePerson(["yamada", "taro"], ["suzuki", "hanako"])).toBe(false)
  })

  it("returns true when either is empty", () => {
    expect(samePerson([], ["taro"])).toBe(true)
    expect(samePerson(["taro"], [])).toBe(true)
  })
})

describe("resolvePersons", () => {
  it("returns empty for empty input", () => {
    const result = resolvePersons([])
    expect(result.persons).toEqual([])
    expect(result.occurrencePersonId).toEqual([])
  })

  it("merges occurrences with the same email", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        email: "alice@example.com",
        enFamily: "Smith",
        enGiven: "Alice",
        displayName: "Smith Alice",
        tokens: ["alice", "smith"],
      }),
      occ({
        applId: "2",
        email: "alice@example.com",
        enFamily: "Smith",
        enGiven: "Alice",
        displayName: "Smith Alice",
        tokens: ["alice", "smith"],
      }),
    ])
    expect(result.persons).toHaveLength(1)
    expect(result.occurrencePersonId[0]).toBe(result.occurrencePersonId[1])
  })

  it("merges occurrences with the same ORCID", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        email: "alice@a.com",
        orcid: "0000-0001-2345-6789",
        displayName: "Alice",
        tokens: ["alice"],
      }),
      occ({
        applId: "2",
        email: "alice@b.com",
        orcid: "0000-0001-2345-6789",
        displayName: "Alice",
        tokens: ["alice"],
      }),
    ])
    expect(result.persons).toHaveLength(1)
  })

  it("keeps separate persons for same account with disjoint names (name-guard)", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        accountId: "shared-account",
        email: "alice@a.com",
        enFamily: "Li",
        enGiven: "Jiming",
        displayName: "Li Jiming",
        tokens: ["jiming", "li"],
      }),
      occ({
        applId: "2",
        accountId: "shared-account",
        email: "pan@b.com",
        enFamily: "Pan",
        enGiven: "Yedong",
        displayName: "Pan Yedong",
        tokens: ["pan", "yedong"],
      }),
    ])
    expect(result.persons).toHaveLength(2)
    expect(result.occurrencePersonId[0]).not.toBe(result.occurrencePersonId[1])
  })

  it("merges same account with compatible names", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        accountId: "same-acc",
        email: "alice@a.com",
        displayName: "Yamada Taro",
        tokens: ["taro", "yamada"],
      }),
      occ({
        applId: "2",
        accountId: "same-acc",
        email: "taro@b.com",
        displayName: "Taro Yamada",
        tokens: ["taro", "yamada"],
      }),
    ])
    expect(result.persons).toHaveLength(1)
  })

  it("selects canonical fields from latest submitDate", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        email: "alice@example.com",
        enFamily: "OldFamily",
        enGiven: "OldGiven",
        displayName: "OldFamily OldGiven",
        tokens: ["oldfamily", "oldgiven"],
        submitDate: "2024-01-01",
      }),
      occ({
        applId: "2",
        email: "alice@example.com",
        enFamily: "NewFamily",
        enGiven: "NewGiven",
        displayName: "NewFamily NewGiven",
        tokens: ["newfamily", "newgiven"],
        submitDate: "2025-06-01",
      }),
    ])
    expect(result.persons).toHaveLength(1)
    expect(result.persons[0].enFamily).toBe("NewFamily")
    expect(result.persons[0].enGiven).toBe("NewGiven")
  })

  it("assigns best role (PI > member > collaborator)", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        email: "alice@example.com",
        role: "collaborator",
        displayName: "Alice",
        tokens: ["alice"],
      }),
      occ({
        applId: "2",
        email: "alice@example.com",
        role: "PI",
        displayName: "Alice",
        tokens: ["alice"],
      }),
    ])
    expect(result.persons[0].role).toBe("PI")
  })

  it("maps each occurrence to a personId", () => {
    const result = resolvePersons([
      occ({
        applId: "1",
        email: "a@x.com",
        displayName: "A",
        tokens: ["a"],
      }),
      occ({
        applId: "2",
        email: "b@x.com",
        displayName: "B",
        tokens: ["b"],
      }),
    ])
    expect(result.occurrencePersonId).toHaveLength(2)
    expect(result.occurrencePersonId[0]).toMatch(/^P\d{5}$/)
    expect(result.occurrencePersonId[1]).toMatch(/^P\d{5}$/)
    expect(result.occurrencePersonId[0]).not.toBe(
      result.occurrencePersonId[1],
    )
  })
})

describe("isExcluded", () => {
  it("excludes persons matching EXCLUDE_EMAILS", () => {
    const person = resolvePersons([
      occ({
        email: "humandbs+agent@dbcls.jp",
        displayName: "Agent",
        tokens: ["agent"],
      }),
    ]).persons[0]
    expect(isExcluded(person)).toBe(true)
  })

  it("excludes persons matching EXCLUDE_NAME_TOKENS (secretariat NBDC)", () => {
    const person = resolvePersons([
      occ({
        email: "some@example.com",
        displayName: "secretariat NBDC",
        tokens: ["nbdc", "secretariat"],
      }),
    ]).persons[0]
    expect(isExcluded(person)).toBe(true)
  })

  it("does not exclude normal persons", () => {
    const person = resolvePersons([
      occ({
        email: "normal@example.com",
        displayName: "Normal Person",
        tokens: ["normal", "person"],
      }),
    ]).persons[0]
    expect(isExcluded(person)).toBe(false)
  })
})
