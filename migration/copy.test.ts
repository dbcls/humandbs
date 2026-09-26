import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { dropReason, planAssets, planCopy, planDraftFiles, type Census } from "./copy"

const RESEARCH = { hum0185: "0193-r185", hum0197: "0193-r197" } as Record<string, string>
const researchIdOf = (hum: string) => RESEARCH[hum]

const inPrefix = (size = 100) => ({ size, in_box: true })
const loose = (size = 100) => ({ size, in_box: false })

describe("dropReason", () => {
  it("keeps the case zips of hum0181 and drops the other three forms of the same slides", () => {
    expect(dropReason("hum0181/A-5994.zip", inPrefix())).toBeNull()
    expect(dropReason("hum0181/A-5994/A-5994, HSD3B2.svs", inPrefix())).toBe("duplicate")
    expect(dropReason("hum0181/hum0181.v1.apcc.v1.HSD3B2_svs_files/A-5994, HSD3B2.svs", inPrefix())).toBe("duplicate")
    expect(dropReason("hum0181/hum0181.v1.apcc.v1.HSD3B2_svs_files.zip", inPrefix())).toBe("duplicate")
  })

  it("drops hum0185's stain-wise zips and keeps its case zips and supplements", () => {
    expect(dropReason("hum0185/hum0185.v1.ap.v1.HE_svs_files.zip", inPrefix())).toBe("duplicate")
    expect(dropReason("hum0185/102.zip", inPrefix())).toBeNull()
    expect(dropReason("hum0185/Figure_S1.pdf", inPrefix())).toBeNull()
  })

  it("drops what a later version replaced, and nothing of the version that replaced it", () => {
    expect(dropReason("hum0014/hum0014.v16.T2DM.v1.zip", inPrefix())).toBe("superseded")
    expect(dropReason("hum0014/hum0014.v17.BC.v1.zip", inPrefix())).toBe("superseded")
    expect(dropReason("hum0014/hum0014.v17.T2DM.v1.zip", inPrefix())).toBeNull()
    expect(dropReason("hum0014/hum0014.v1.freq.v1.zip", inPrefix())).toBeNull()
  })

  it("drops hum0009's unpacked copies and keeps the zips they came from", () => {
    expect(dropReason("hum0009/Blood-1.tab", inPrefix())).toBe("unpacked-copy")
    expect(dropReason("hum0009/Blood.doc", inPrefix())).toBe("unpacked-copy")
    expect(dropReason("hum0009/Blood-1.zip", inPrefix())).toBeNull()
    expect(dropReason("hum0010/Blood.doc", inPrefix())).toBeNull()
  })

  it("drops a placeholder page only at the placeholder's size", () => {
    expect(dropReason("hum0290/index.html", inPrefix(47))).toBe("placeholder")
    expect(dropReason("hum0290/index.html", inPrefix(48))).toBeNull()
  })

  it("drops working files wherever they sit in a prefix", () => {
    expect(dropReason("hum0197/hum0197.v26/clinical/.DS_Store", inPrefix())).toBe("working-file")
    expect(dropReason("hum0311/md5sum.txt", inPrefix())).toBe("working-file")
  })

  it("drops loose files except the two article bodies link to", () => {
    expect(dropReason("DAC/minutes.pdf", loose())).toBe("outside-research-directory")
    expect(dropReason("NBDCform2_access_e.xls", loose())).toBeNull()
    expect(dropReason("GenomeScience_e_20150303.pdf", loose())).toBeNull()
  })
})

describe("planCopy", () => {
  it("flattens the prefix, keeping only the file name", () => {
    const plan = planCopy({ "hum0197/hum0197.v26/clinical/combined/BBJ1.txt.gz": inPrefix() }, researchIdOf)

    expect(plan.copy).toEqual([{ source: "hum0197/hum0197.v26/clinical/combined/BBJ1.txt.gz", size: 100, bucket: "files", key: "hum0197/BBJ1.txt.gz" }])
  })

  it("keeps an unpublished research's prefix, and a file of an unpublished dataset, out of public reach", () => {
    const plan = planCopy({
      "hum0185/102.zip": inPrefix(),
      "hum0197/hum0197.v7.covid19-umi.v1.zip": inPrefix(),
      "hum0197/hum0197.v5.gwas.v1.zip": inPrefix(),
    }, researchIdOf)

    expect(plan.copy.map((one) => `${one.bucket}:${one.key}`)).toEqual([
      "private:0193-r185/102.zip",
      "files:hum0197/hum0197.v5.gwas.v1.zip",
      "private:0193-r197/hum0197.v7.covid19-umi.v1.zip",
    ])
  })

  it("moves the linked loose files into common/", () => {
    expect(planCopy({ "NBDCform2_access_e.xls": loose() }, researchIdOf).copy[0]?.key).toBe("common/NBDCform2_access_e.xls")
  })

  it("refuses two files that would land on one key rather than losing one", () => {
    expect(() => planCopy({ "hum0197/a/x.zip": inPrefix(), "hum0197/b/x.zip": inPrefix() }, researchIdOf)).toThrow(/hum0197\/x\.zip/)
  })

  it("refuses a private prefix with no research to key it by", () => {
    expect(() => planCopy({ "hum0185/102.zip": inPrefix() }, () => undefined)).toThrow(/hum0185/)
  })

  it("accounts for every file once, copied or dropped, with its size", () => {
    const path = fc.tuple(fc.constantFrom("hum0001", "hum0009", "hum0014", "hum0181", "hum0197"), fc.stringMatching(/^[a-z0-9]{1,6}\.(zip|tab|txt)$/))
      .map(([prefix, name]) => `${prefix}/${name}`)
    fc.assert(fc.property(fc.dictionary(path, fc.record({ size: fc.nat(), in_box: fc.constant(true) })), (census: Census) => {
      const plan = planCopy(census, researchIdOf)
      const seen = [...plan.copy.map((one) => one.source), ...plan.dropped.map((one) => one.source)].sort()
      expect(seen).toEqual(Object.keys(census).sort())
      const bytes = [...plan.copy, ...plan.dropped].reduce((sum, one) => sum + one.size, 0)
      expect(bytes).toBe(Object.values(census).reduce((sum, one) => sum + one.size, 0))
    }))
  })
})

describe("planAssets", () => {
  it("keeps the article assets' own paths under common/", () => {
    expect(planAssets(["guidelines/data-sharing-guidelines/dataClassification_6.png"], () => 10)).toEqual([{
      source: "guidelines/data-sharing-guidelines/dataClassification_6.png",
      size: 10,
      bucket: "files",
      key: "common/guidelines/data-sharing-guidelines/dataClassification_6.png",
    }])
  })
})

describe("planDraftFiles", () => {
  it("puts a file a draft links into its research's private prefix", () => {
    expect(planDraftFiles(["hum0185/78_genes.xlsx"], () => 9383, researchIdOf))
      .toEqual([{ source: "hum0185/78_genes.xlsx", size: 9383, bucket: "private", key: "0193-r185/78_genes.xlsx" }])
  })

  it("refuses a file of no research, or one not directly under a research's directory", () => {
    expect(() => planDraftFiles(["hum9999/a.txt"], () => 1, researchIdOf)).toThrow(/hum9999/)
    expect(() => planDraftFiles(["hum0185/sub/a.txt"], () => 1, researchIdOf)).toThrow(/hum0185\/sub/)
    expect(() => planDraftFiles(["hum0185"], () => 1, researchIdOf)).toThrow(/hum0185/)
  })
})
