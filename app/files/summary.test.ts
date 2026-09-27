import { describe, expect, it } from "vitest"

import { sortFormats } from "./formats"
import { datasetFileSummary, NO_FILES } from "./summary"

const LISTING = [
  { name: "hum0014.v8.ALT.zip", size: 1_000 },
  { name: "hum0014.v5.AF.v1.txt.zip", size: 250 },
  { name: "readme.html", size: 3 },
]

describe("datasetFileSummary", () => {
  it("ポータルが発行した ID のデータセットは、選択したファイルの大きさの合計と名前の形式", () => {
    expect(datasetFileSummary({
      label: "NHA000001",
      selection: ["hum0014.v8.ALT.zip", "hum0014.v5.AF.v1.txt.zip"],
      listing: LISTING,
      archive: { byteCount: 99, formats: ["fastq"] },
    })).toEqual({ byteCount: 1_250, formats: ["txt", "zip"] })
  })

  it("hum で始まる旧い ID もポータルが発行したものとして選択から読む", () => {
    expect(datasetFileSummary({ label: "hum0014.v1.freq.v1", selection: ["readme.html"], listing: LISTING, archive: null }))
      .toEqual({ byteCount: 3, formats: ["html"] })
  })

  it("選択した名前が一覧に無いときとファイルストアが応答しないときは大きさを出さず、形式は名前から出す", () => {
    expect(datasetFileSummary({ label: "NHA000001", selection: ["gone.vcf.gz"], listing: LISTING, archive: null }))
      .toEqual({ byteCount: null, formats: ["vcf"] })
    expect(datasetFileSummary({ label: "NHA000001", selection: ["readme.html"], listing: null, archive: null }))
      .toEqual({ byteCount: null, formats: ["html"] })
  })

  it("何も選択していないデータセットには、大きさも形式も無い", () => {
    expect(datasetFileSummary({ label: "NHA000001", selection: [], listing: LISTING, archive: null })).toEqual(NO_FILES)
  })

  it("アーカイブのデータセットは取り直しの行から出し、選択と一覧は読まない", () => {
    expect(datasetFileSummary({
      label: "JGAD000626",
      selection: ["readme.html"],
      listing: LISTING,
      archive: { byteCount: 6_627_294_298, formats: ["idat", "cel"] },
    })).toEqual({ byteCount: 6_627_294_298, formats: sortFormats(["idat", "cel"]) })
  })

  it("アーカイブにファイルの無いデータセットと、ID がまだ無いデータセットには、大きさも形式も無い", () => {
    expect(datasetFileSummary({ label: "DRA000001", selection: [], listing: LISTING, archive: null })).toEqual(NO_FILES)
    expect(datasetFileSummary({ label: "", selection: ["readme.html"], listing: LISTING, archive: null })).toEqual(NO_FILES)
  })
})
