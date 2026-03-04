/**
 * Tests for applyFacetOrder — facet value sorting by priority order
 */
import { describe, expect, it } from "bun:test"

import { applyFacetOrder } from "@/api/es-client/search"
import type { FacetValue } from "@/api/types"

const fv = (value: string, count: number): FacetValue => ({ value, count })

describe("applyFacetOrder", () => {
  it("should place defined values first in defined order", () => {
    const values = [
      fv("RNA-seq", 50),
      fv("WGS", 30),
      fv("WES", 20),
    ]
    const order = ["WGS", "WES", "RNA-seq"]

    const result = applyFacetOrder(values, order)

    expect(result.map(v => v.value)).toEqual(["WGS", "WES", "RNA-seq"])
  })

  it("should place undefined values after defined values, sorted by count descending", () => {
    const values = [
      fv("ChIP-seq", 100),
      fv("WGS", 30),
      fv("ATAC-seq", 40),
      fv("WES", 20),
    ]
    const order = ["WGS", "WES"]

    const result = applyFacetOrder(values, order)

    expect(result.map(v => v.value)).toEqual(["WGS", "WES", "ChIP-seq", "ATAC-seq"])
  })

  it("should not add values that exist in order but not in ES results", () => {
    const values = [
      fv("WGS", 30),
      fv("ChIP-seq", 10),
    ]
    const order = ["WGS", "WES", "RNA-seq"]

    const result = applyFacetOrder(values, order)

    expect(result).toEqual([fv("WGS", 30), fv("ChIP-seq", 10)])
  })

  it("should preserve original count-descending order when order array is empty", () => {
    const values = [
      fv("WGS", 30),
      fv("ChIP-seq", 100),
      fv("WES", 50),
    ]

    const result = applyFacetOrder(values, [])

    expect(result.map(v => v.value)).toEqual(["ChIP-seq", "WES", "WGS"])
  })

  it("should not mutate the input array", () => {
    const values = [fv("B", 10), fv("A", 20)]
    const original = [...values]

    applyFacetOrder(values, ["A"])

    expect(values).toEqual(original)
  })

  it("should break ties among undefined values by count descending", () => {
    const values = [
      fv("X", 10),
      fv("Y", 30),
      fv("Z", 20),
    ]

    const result = applyFacetOrder(values, [])

    expect(result.map(v => v.value)).toEqual(["Y", "Z", "X"])
  })

  it("should handle single-element input", () => {
    const values = [fv("WGS", 5)]

    const result = applyFacetOrder(values, ["WGS"])

    expect(result).toEqual([fv("WGS", 5)])
  })

  it("should handle empty input", () => {
    const result = applyFacetOrder([], ["WGS"])

    expect(result).toEqual([])
  })
})
