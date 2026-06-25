import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import fc from "fast-check"

import {
  TtlMapCache,
  buildGeaDistribution,
  buildMetaboBankDistribution,
  detectKind,
  distributionCache,
  getDistribution,
  getDistributionSafe,
} from "@/api/utils/distribution"

describe("detectKind", () => {
  it("detects GEA IDs", () => {
    expect(detectKind("E-GEAD-1051")).toBe("gea")
    expect(detectKind("E-GEAD-0")).toBe("gea")
  })

  it("detects MetaboBank IDs", () => {
    expect(detectKind("MTBKS213")).toBe("metabobank")
    expect(detectKind("MTBKS214")).toBe("metabobank")
  })

  it("detects DRA IDs", () => {
    expect(detectKind("DRA000908")).toBe("dra")
    expect(detectKind("DRA014191")).toBe("dra")
  })

  it("detects NBDC Dataset IDs", () => {
    expect(detectKind("hum0014.v9.Men.v1")).toBe("nbdc-dataset")
    expect(detectKind("hum0013.v1.freq.v1")).toBe("nbdc-dataset")
  })

  it("returns unknown for JGAD", () => {
    expect(detectKind("JGAD000001")).toBe("unknown")
  })

  it("returns unknown for BioProject", () => {
    expect(detectKind("PRJDB10452")).toBe("unknown")
  })
})

describe("buildGeaDistribution", () => {
  it("builds correct URL for E-GEAD-1051", () => {
    const result = buildGeaDistribution("E-GEAD-1051")
    expect(result).toEqual([{
      url: "https://ddbj.nig.ac.jp/public/ddbj_database/gea/experiment/E-GEAD-1000/E-GEAD-1051/",
      name: "E-GEAD-1051",
      type: "directory",
      encodingFormat: "DATA",
    }])
  })

  it("groups by 1000s correctly", () => {
    expect(buildGeaDistribution("E-GEAD-0")[0].url)
      .toContain("/E-GEAD-000/E-GEAD-0/")
    expect(buildGeaDistribution("E-GEAD-999")[0].url)
      .toContain("/E-GEAD-000/E-GEAD-999/")
    expect(buildGeaDistribution("E-GEAD-1000")[0].url)
      .toContain("/E-GEAD-1000/E-GEAD-1000/")
    expect(buildGeaDistribution("E-GEAD-2345")[0].url)
      .toContain("/E-GEAD-2000/E-GEAD-2345/")
  })

  it("returns stable results for any valid GEA accession number", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9999 }), (num) => {
        const id = `E-GEAD-${num}`
        const result = buildGeaDistribution(id)
        expect(result).toHaveLength(1)
        expect(result[0].url).toContain(id)
        expect(result[0].type).toBe("directory")
      }),
    )
  })
})

describe("buildMetaboBankDistribution", () => {
  it("builds correct URL", () => {
    const result = buildMetaboBankDistribution("MTBKS213")
    expect(result).toEqual([{
      url: "https://ddbj.nig.ac.jp/public/metabobank/study/MTBKS213/",
      name: "MTBKS213",
      type: "directory",
      encodingFormat: "DATA",
    }])
  })
})

describe("getDistribution", () => {
  it("returns empty array for unknown ID types", async () => {
    const result = await getDistribution("JGAD000001", "hum0001")
    expect(result).toEqual([])
  })

  it("returns GEA distribution synchronously (no external calls)", async () => {
    const result = await getDistribution("E-GEAD-1051", "hum0001")
    expect(result).toHaveLength(1)
    expect(result[0].encodingFormat).toBe("DATA")
  })

  it("returns MetaboBank distribution synchronously", async () => {
    const result = await getDistribution("MTBKS213", "hum0001")
    expect(result).toHaveLength(1)
    expect(result[0].url).toContain("MTBKS213")
  })
})

describe("getDistribution caching", () => {
  beforeEach(() => {
    distributionCache.clear()
  })

  it("caches GEA result on second call", async () => {
    const r1 = await getDistribution("E-GEAD-1051", "hum0001")
    const r2 = await getDistribution("E-GEAD-1051", "hum0001")
    expect(r1).toEqual(r2)
    expect(distributionCache.size).toBe(1)
  })

  it("returns different results for different IDs", async () => {
    await getDistribution("E-GEAD-1051", "hum0001")
    await getDistribution("MTBKS213", "hum0001")
    expect(distributionCache.size).toBe(2)
  })
})

describe("TtlMapCache", () => {
  it("returns undefined for missing keys", () => {
    const cache = new TtlMapCache<string>(1000)
    expect(cache.get("missing")).toBeUndefined()
  })

  it("stores and retrieves values", () => {
    const cache = new TtlMapCache<string>(1000)
    cache.set("key", "value")
    expect(cache.get("key")).toBe("value")
  })

  it("expires entries after TTL", () => {
    const cache = new TtlMapCache<string>(0)
    cache.set("key", "value")
    expect(cache.get("key")).toBeUndefined()
  })

  it("clears all entries", () => {
    const cache = new TtlMapCache<string>(60_000)
    cache.set("a", "1")
    cache.set("b", "2")
    expect(cache.size).toBe(2)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})

describe("getDistributionSafe", () => {
  it("returns empty array on error instead of throwing", async () => {
    const result = await getDistributionSafe("JGAD000001", "hum0001")
    expect(result).toEqual([])
  })
})
