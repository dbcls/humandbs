/**
 * Tests for `sortCriteria`, the helper that aggregates a Research's per-dataset
 * `criteria` values into the `ResearchSummary.criteria` array.
 *
 * Invariants enforced (any regression here re-introduces the bug where a
 * Research with both Controlled-access and Unrestricted-access datasets only
 * shows one of the values in the listing):
 * - Output contains every distinct input value (no information loss).
 * - Output is deduplicated.
 * - Output is ordered by `CRITERIA_CANONICAL_ORDER` (strictest first).
 */
import { describe, expect, it } from "bun:test"
import fc from "fast-check"

import { sortCriteria } from "@/api/es-client/search"
import { CRITERIA_CANONICAL_ORDER } from "@/es/types"
import type { CriteriaCanonical } from "@/es/types"

const ALL_CRITERIA = CRITERIA_CANONICAL_ORDER

describe("sortCriteria", () => {
  it("returns [] for an empty input", () => {
    expect(sortCriteria([])).toEqual([])
  })

  it("returns a single-element array when all datasets share the same criteria", () => {
    expect(sortCriteria(["Controlled-access (Type I)", "Controlled-access (Type I)"]))
      .toEqual(["Controlled-access (Type I)"])
  })

  it("preserves both values when a Research mixes Controlled-access and Unrestricted-access (hum0005-v6 regression)", () => {
    const input: CriteriaCanonical[] = [
      "Unrestricted-access",
      "Controlled-access (Type I)",
      "Controlled-access (Type I)",
      "Controlled-access (Type I)",
      "Controlled-access (Type I)",
    ]

    expect(sortCriteria(input)).toEqual([
      "Controlled-access (Type I)",
      "Unrestricted-access",
    ])
  })

  it("orders all three values strictest-first regardless of input order", () => {
    const input: CriteriaCanonical[] = [
      "Unrestricted-access",
      "Controlled-access (Type II)",
      "Controlled-access (Type I)",
    ]

    expect(sortCriteria(input)).toEqual([
      "Controlled-access (Type I)",
      "Controlled-access (Type II)",
      "Unrestricted-access",
    ])
  })

  it("PBT: output is deduplicated, in canonical order, and contains the same value set as the input", () => {
    const criteriaArb = fc.constantFrom(...ALL_CRITERIA)

    fc.assert(
      fc.property(fc.array(criteriaArb), (input) => {
        const out = sortCriteria(input)

        // Dedup: no value appears twice
        expect(new Set(out).size).toBe(out.length)

        // Canonical order: each pair (out[i], out[i+1]) is in canonical rank order
        for (let i = 1; i < out.length; i++) {
          expect(ALL_CRITERIA.indexOf(out[i - 1])).toBeLessThan(ALL_CRITERIA.indexOf(out[i]))
        }

        // Same set of distinct values as the input
        expect(new Set(out)).toEqual(new Set(input))
      }),
    )
  })
})
