import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { catalogArb, datasetContentArb, filesArb, researchContentArb } from "./arbitraries/content"
import { publicDatasetContent, publicResearchContent, type PublicOptions } from "./public"

const PUBLISHED: PublicOptions = { keepUnsettled: false }
const PREVIEW: PublicOptions = { keepUnsettled: true }

/**
 * `state` and `kind` are the shape of the value rather than part of it. Walking
 * into them would let "value" count as a string the output invented, since the
 * published form writes that discriminator where the content had "unknown".
 */
const STRUCTURAL = new Set(["state", "kind"])

/** Every non-empty string a value carries, ignoring the discriminators. */
function strings(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value !== "") into.add(value)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) strings(item, into)
    return into
  }
  if (value === null || typeof value !== "object") return into
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!STRUCTURAL.has(key)) strings(item, into)
  }
  return into
}

function unsettled(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((count, item) => count + unsettled(item), 0)
  }
  if (value === null || typeof value !== "object") return 0
  const record = value as Record<string, unknown>
  let count = record.state === "unknown" ? 1 : 0
  for (const item of Object.values(record)) count += unsettled(item)
  return count
}

const modeArb = fc.boolean().map((keepUnsettled): PublicOptions => ({ keepUnsettled }))

describe("publicResearchContent", () => {
  it("leaves no unsettled slot in what a public page receives", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      expect(unsettled(publicResearchContent(content, PUBLISHED))).toBe(0)
    }))
  })

  it("drops no unsettled slot from what a preview receives", () => {
    fc.assert(fc.property(researchContentArb, (content) => {
      expect(unsettled(publicResearchContent(content, PREVIEW))).toBe(unsettled(content))
    }))
  })

  it("carries no string the content does not have", () => {
    fc.assert(fc.property(researchContentArb, modeArb, (content, options) => {
      const source = strings(content)
      for (const value of strings(publicResearchContent(content, options))) {
        expect(source.has(value)).toBe(true)
      }
    }))
  })

  it("makes no further difference when applied to its own output", () => {
    fc.assert(fc.property(researchContentArb, modeArb, (content, options) => {
      const once = publicResearchContent(content, options)
      expect(publicResearchContent(once, options)).toEqual(once)
    }))
  })
})

describe("publicDatasetContent", () => {
  it("leaves no unsettled slot in what a public page receives", () => {
    fc.assert(fc.property(datasetContentArb, catalogArb, filesArb, (content, keys, files) => {
      expect(unsettled(publicDatasetContent(content, { keys, files }, PUBLISHED))).toBe(0)
    }))
  })

  it("carries no string the content does not have", () => {
    fc.assert(fc.property(
      datasetContentArb, catalogArb, filesArb, modeArb,
      (content, keys, files, options) => {
        const source = strings(content)
        for (const value of strings(publicDatasetContent(content, { keys, files }, options))) {
          expect(source.has(value)).toBe(true)
        }
      },
    ))
  })

  it("keeps no value under a key the catalog does not show on the public page", () => {
    fc.assert(fc.property(
      datasetContentArb, catalogArb, filesArb, modeArb,
      (content, keys, files, options) => {
        const out = publicDatasetContent(content, { keys, files }, options)
        const kept = [...out.values, ...out.experiments.flatMap((e) => e.values)]
        for (const value of kept) {
          expect(keys.get(value.keyId)?.showOnPublicPage).toBe(true)
        }
      },
    ))
  })

  it("keeps only the file selections the listing contains", () => {
    fc.assert(fc.property(
      datasetContentArb, catalogArb, filesArb, modeArb,
      (content, keys, files, options) => {
        const out = publicDatasetContent(content, { keys, files }, options)
        for (const name of out.fileSelection) {
          expect(files.some((file) => file.name === name)).toBe(true)
        }
      },
    ))
  })

  it("makes no further difference when applied to its own output", () => {
    fc.assert(fc.property(
      datasetContentArb, catalogArb, filesArb, modeArb,
      (content, keys, files, options) => {
        const once = publicDatasetContent(content, { keys, files }, options)
        expect(publicDatasetContent(once, { keys, files }, options)).toEqual(once)
      },
    ))
  })
})
