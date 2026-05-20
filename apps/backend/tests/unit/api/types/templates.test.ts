import { describe, expect, it } from "bun:test"

import { TemplateDatasetParamsSchema } from "@/api/types/templates"

describe("TemplateDatasetParamsSchema.externalId", () => {
  it("accepts JGAD accessions", () => {
    expect(
      TemplateDatasetParamsSchema.safeParse({ externalId: "JGAD000001" })
        .success,
    ).toBe(true)
    expect(
      TemplateDatasetParamsSchema.safeParse({ externalId: "JGAD999999" })
        .success,
    ).toBe(true)
  })

  it("accepts DRA Submission accessions", () => {
    expect(
      TemplateDatasetParamsSchema.safeParse({ externalId: "DRA000001" })
        .success,
    ).toBe(true)
    expect(
      TemplateDatasetParamsSchema.safeParse({ externalId: "DRA000100" })
        .success,
    ).toBe(true)
  })

  it("rejects other JGA prefixes (JGAS, JGAN, JGAX, JGAR)", () => {
    for (const id of ["JGAS000001", "JGAN000001", "JGAX000001", "JGAR000001"]) {
      expect(
        TemplateDatasetParamsSchema.safeParse({ externalId: id }).success,
      ).toBe(false)
    }
  })

  it("rejects sub-level SRA / INSDC accessions (DRP, DRX, DRS, DRR, PRJDB, SAMD)", () => {
    for (const id of [
      "DRP000001",
      "DRX000001",
      "DRS000001",
      "DRR000001",
      "PRJDB1234",
      "SAMD00012345",
    ]) {
      expect(
        TemplateDatasetParamsSchema.safeParse({ externalId: id }).success,
      ).toBe(false)
    }
  })

  it("rejects empty / lowercase / malformed inputs", () => {
    for (const id of ["", "jgad000001", "DRA-001", "JGAD000001a", "FOO000001"]) {
      expect(
        TemplateDatasetParamsSchema.safeParse({ externalId: id }).success,
      ).toBe(false)
    }
  })
})
