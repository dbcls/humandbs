import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { DatasetContent, ResearchContent, Slot, ValueSlot } from "~/content/types"
import { icd10CodesIn } from "~/icd10/codes"

import {
  catalogFixture,
  draSubmissionArb,
  dsBranchArb,
  jgadRegistrationArb,
} from "./arbitraries/upstream"
import type { CatalogWithTerms } from "./queries.server"
import { draDatasetSeed, jgadDatasetSeed, researchContentFrom, type DatasetSeed } from "./templates"

/**
 * The laws a seeded draft obeys, whatever an upstream system happens to say.
 *
 * The first two are what stops a template from writing content the editing
 * screen would then refuse: a slot under a key the catalog does not hold, or a
 * value marked as a question nobody asked. The third is the whole of the promise
 * about vocabularies — a word upstream states is either written or named, and
 * the answer is never "quietly neither" (docs/editing.md の「下書きを外から作る」).
 */

const KEY_BY_ID = new Map(catalogFixture.keys.map((key) => [key.id, key]))
const TERM_BY_ID = new Map(catalogFixture.terms.map((term) => [term.id, term]))

function slotsOf(content: DatasetContent): { scope: "dataset" | "experiment", slot: ValueSlot }[] {
  return [
    ...content.values.map((slot) => ({ scope: "dataset" as const, slot })),
    ...content.experiments.flatMap((one) =>
      one.values.map((slot) => ({ scope: "experiment" as const, slot }))),
  ]
}

/** Whether one slot could be saved through the editing screen's own check. */
function acceptable(catalog: CatalogWithTerms, scope: string, slot: ValueSlot): boolean {
  const key = KEY_BY_ID.get(slot.keyId)
  if (key?.scope !== scope) return false
  if (key.valueType !== slot.value.kind) return false
  if (slot.value.kind === "disease") {
    if (slot.value.diseases.state !== "value") return false
    const rows = slot.value.diseases.value
    if (!key.multiple && rows.length > 1) return false
    return rows.every((one) =>
      one.termIds.every((id) => TERM_BY_ID.get(id)?.setId === key.vocabularySetId))
  }
  if (slot.value.kind !== "vocabulary") return true
  if (slot.value.termIds.state !== "value") return false
  const chosen = slot.value.termIds.value
  if (!key.multiple && chosen.length > 1) return false
  return chosen.every((id) => TERM_BY_ID.get(id)?.setId === key.vocabularySetId)
}

/** The codes of the disease terms a content names. */
function diseaseCodesIn(content: DatasetContent): string[] {
  return content.experiments
    .flatMap((one) => one.values)
    .flatMap((slot) => (slot.value.kind === "disease" && slot.value.diseases.state === "value"
      ? slot.value.diseases.value.flatMap((disease) => disease.termIds)
      : []))
    .flatMap((id) => {
      const term = TERM_BY_ID.get(id)
      return term?.setId === "set-disease" ? [term.code] : []
    })
}

/** Every state a value in the content is in, at any depth. */
function statesOf(content: ResearchContent | DatasetContent): Slot<unknown>["state"][] {
  const found: Slot<unknown>["state"][] = []
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== "object") return
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    const record = value as Record<string, unknown>
    if (typeof record.state === "string") found.push(record.state as Slot<unknown>["state"])
    Object.values(record).forEach(walk)
  }
  walk(content)
  return found
}

const seedArb: fc.Arbitrary<{ seed: DatasetSeed, icd10: string }> = fc.oneof(
  fc.tuple(jgadRegistrationArb, dsBranchArb)
    .map(([registration, branch]) => ({
      seed: jgadDatasetSeed(registration, branch, catalogFixture),
      icd10: branch.icd10,
    })),
  fc.tuple(draSubmissionArb, dsBranchArb)
    .map(([submission, branch]) => ({
      seed: draDatasetSeed(submission, branch, catalogFixture),
      icd10: branch.icd10,
    })),
)

describe("what a seeded draft writes", () => {
  it("only ever writes a value under a catalog key that admits it", () => {
    fc.assert(fc.property(seedArb, ({ seed }) => {
      for (const { scope, slot } of slotsOf(seed.content)) {
        expect(acceptable(catalogFixture, scope, slot)).toBe(true)
      }
    }))
  })

  it("never marks a value as unsettled, which is a mark a curator makes", () => {
    fc.assert(fc.property(seedArb, dsBranchArb, ({ seed }, branch) => {
      expect(statesOf(seed.content).every((state) => state === "value")).toBe(true)
      expect(statesOf(researchContentFrom(branch)).every((state) => state === "value")).toBe(true)
    }))
  })

  it("either writes a term for a disease the application states, or names it as not written", () => {
    fc.assert(fc.property(seedArb, ({ seed, icd10 }) => {
      const named = new Set(
        seed.dropped.filter((value) => value.keyCode === "disease").map((value) => value.value),
      )
      const written = diseaseCodesIn(seed.content)
      // An empty seed has nowhere to write, and a disease is only claimed by the
      // experiments that exist; what must never happen is a code being lost.
      if (seed.content.experiments.length === 0) return
      for (const code of icd10CodesIn(icd10)) {
        // **Rolling up only ever shortens**, so a code that was written is one
        // the field's code starts with. Anything else has to have been named.
        const carried = written.some((one) => code.startsWith(one))
        expect(carried || named.has(code)).toBe(true)
      }
    }))
  })

  it("writes no name for a disease, because the application form holds none", () => {
    fc.assert(fc.property(seedArb, ({ seed }) => {
      const rows = seed.content.experiments
        .flatMap((one) => one.values)
        .flatMap((slot) => (slot.value.kind === "disease" && slot.value.diseases.state === "value"
          ? slot.value.diseases.value
          : []))
      expect(rows.every((one) => one.nameJa === null && one.nameEn === null)).toBe(true)
    }))
  })

  it("never names a value it also wrote", () => {
    fc.assert(fc.property(seedArb, ({ seed }) => {
      const written = new Set(
        slotsOf(seed.content)
          .flatMap(({ slot }) => {
            const value = slot.value
            if (value.kind === "vocabulary" && value.termIds.state === "value") {
              return value.termIds.value
            }
            if (value.kind === "disease" && value.diseases.state === "value") {
              return value.diseases.value.flatMap((one) => one.termIds)
            }
            return []
          })
          .flatMap((id) => {
            const term = TERM_BY_ID.get(id)
            return term === undefined ? [] : [term.code.toLowerCase(), term.labelEn.toLowerCase()]
          }),
      )
      for (const value of seed.dropped) {
        expect(written.has(value.value.toLowerCase())).toBe(false)
      }
    }))
  })
})
