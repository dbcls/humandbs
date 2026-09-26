import { describe, expect, it } from "vitest"

import { blockDataFromEs, handKey, jgadsByStudy, splitSharedBlock, type BlockData } from "./inversion"

/** A one-key block, both languages holding the same text unless `en` is given. */
function block(key: string, ja: string, en = ja): BlockData {
  return { [key]: { ja, en } }
}

function ownText(result: ReturnType<typeof splitSharedBlock>, label: string, key: string): string {
  const cell = result.perDataset.get(label)?.[key]
  if (cell === undefined) throw new Error(`no cell ${key} for ${label}`)
  return cell.ja
}

const NO_STUDIES = new Map<string, string[]>()

describe("splitting a cell keyed by accession", () => {
  it("keeps only the line naming this dataset (half-width colon)", () => {
    const result = splitSharedBlock(
      block("Total Data Volume", "JGAD000001: 88 GB\nJGAD000002: 32 GB"),
      ["JGAD000001", "JGAD000002"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000001", "Total Data Volume")).toContain("88 GB")
    expect(ownText(result, "JGAD000001", "Total Data Volume")).not.toContain("32 GB")
    expect(ownText(result, "JGAD000002", "Total Data Volume")).toContain("32 GB")
    // Both languages hold the same text here, so both cells split the same way.
    expect(result.stats).toEqual({ split: 2, shared: 0, review: 0, hand: 0 })
  })

  it("reads a full-width colon the same as a half-width one", () => {
    const result = splitSharedBlock(
      block("Total Data Volume", "JGAD000001：88 GB\nJGAD000002：32 GB"),
      ["JGAD000001", "JGAD000002"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000001", "Total Data Volume")).toContain("88 GB")
    expect(ownText(result, "JGAD000002", "Total Data Volume")).toContain("32 GB")
  })

  it("reads JGA's long form of an accession as the block's dataset it folds to", () => {
    // hum0178-v1 (draft): the JGA dataset in the long form JGA once issued, beside the portal's own dataset.
    const result = splitSharedBlock(
      block("Total Data Volume", "JGAD00000000276: 7 TB(fastq)\nhum0178.v1.sv.v1: 10 MB"),
      ["JGAD000276", "hum0178.v1.sv.v1"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000276", "Total Data Volume")).toBe("JGAD00000000276: 7 TB(fastq)")
    expect(ownText(result, "hum0178.v1.sv.v1", "Total Data Volume")).toBe("hum0178.v1.sv.v1: 10 MB")
  })

  it("resolves a 【JGAS…】 marker to the JGAD it stands for", () => {
    // Real text from hum0018-v3 (WES, draft): a bracketed JGAS per disease
    // category, each covering exactly one of this block's own JGAD datasets.
    const text = [
      "【JGAS000009】神経筋変性疾患(ICD10: G70.9)14症例、および対照健常者7名",
      "【JGAS000337】シャルコー・マリー・トゥース病(CMT)(ICD10: G60.0)69症例、3症例から2検体ずつ解析、他は1検体ずつ 合計72検体",
      "【JGAS000374】前頭側頭型認知症(FTD)(ICD10: G31.0)21症例22検体",
    ].join("\n")
    const result = splitSharedBlock(
      block("Materials and Participants", text),
      ["JGAD000009", "JGAD000448", "JGAD000488"],
      jgadsByStudy([["JGAD000009", "JGAS000009"], ["JGAD000448", "JGAS000337"], ["JGAD000488", "JGAS000374"]]),
    )
    expect(ownText(result, "JGAD000009", "Materials and Participants")).toContain("神経筋変性疾患")
    expect(ownText(result, "JGAD000448", "Materials and Participants")).toContain("シャルコー")
    expect(ownText(result, "JGAD000488", "Materials and Participants")).toContain("前頭側頭型認知症")
    expect(result.stats.split).toBe(2) // ja and en both split cleanly
  })

  it("keeps a markdown-link-led line for the dataset its own accession names", () => {
    // Real text from hum0312: no colon, the accession is the whole line.
    const text = "[DRA016394](https://ddbj.nig.ac.jp/resource/sra-submission/DRA016394)\n"
      + "[DRA018714](https://ddbj.nig.ac.jp/resource/sra-submission/DRA018714)"
    const result = splitSharedBlock(
      block("Sequence Read Archive Accession", text),
      ["DRA016394", "DRA018714"],
      NO_STUDIES,
    )
    expect(ownText(result, "DRA016394", "Sequence Read Archive Accession")).toBe(
      "[DRA016394](https://ddbj.nig.ac.jp/resource/sra-submission/DRA016394)",
    )
    expect(ownText(result, "DRA018714", "Sequence Read Archive Accession")).toBe(
      "[DRA018714](https://ddbj.nig.ac.jp/resource/sra-submission/DRA018714)",
    )
    expect(result.stats).toEqual({ split: 2, shared: 0, review: 0, hand: 0 })
  })

  it("keeps a markdown-link line's trailing note untouched, not just the accession", () => {
    // Real text from hum0122: a parenthetical after the link is part of the value.
    const text = "[DRA006622](https://ddbj.nig.ac.jp/resource/sra-submission/DRA006622)(CB_1)\n"
      + "[DRA007336](https://ddbj.nig.ac.jp/resource/sra-submission/DRA007336)(HDFa)"
    const result = splitSharedBlock(
      block("Sequence Read Archive Accession", text),
      ["DRA006622", "DRA007336"],
      NO_STUDIES,
    )
    expect(ownText(result, "DRA006622", "Sequence Read Archive Accession")).toContain("(CB_1)")
    expect(ownText(result, "DRA007336", "Sequence Read Archive Accession")).toContain("(HDFa)")
  })

  it("finds the accession inside a line whose leading label is prose, not a dataset name", () => {
    // Real text from hum0120: the label before the colon ("non-tumour tissue")
    // names nothing; ownership comes from the accession inside the link.
    const text = "非腫瘍組織: [JGAD000311](https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000311)\n"
      + "腫瘍組織: [DRA011183](https://ddbj.nig.ac.jp/search/entry/sra-submission/DRA011183)"
    const result = splitSharedBlock(
      block("Sequence Read Archive Accession", text),
      ["JGAD000311", "DRA011183"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000311", "Sequence Read Archive Accession")).toBe(
      "非腫瘍組織: [JGAD000311](https://ddbj.nig.ac.jp/resource/jga-dataset/JGAD000311)",
    )
    expect(ownText(result, "DRA011183", "Sequence Read Archive Accession")).toBe(
      "腫瘍組織: [DRA011183](https://ddbj.nig.ac.jp/search/entry/sra-submission/DRA011183)",
    )
  })

  it("keeps every line naming the same dataset twice, rather than treating the repeat as a conflict", () => {
    const text = "JGAD000001: 88 GB(fastq)\nJGAD000001: 12 GB(vcf)\nJGAD000002: 32 GB(fastq)"
    const result = splitSharedBlock(
      block("Total Data Volume", text),
      ["JGAD000001", "JGAD000002"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000001", "Total Data Volume")).toContain("88 GB")
    expect(ownText(result, "JGAD000001", "Total Data Volume")).toContain("12 GB")
    expect(ownText(result, "JGAD000001", "Total Data Volume")).not.toContain("32 GB")
    expect(result.stats.split).toBe(2)
  })
})

describe("a cell that captions each dataset's line", () => {
  const LABELS = ["hum0014.v17.AR.v1", "hum0014.v17.COPD.v1"]
  const cell = [
    "不整脈",
    "[hum0014.v17.AR.v1](/files/hum0014/hum0014.v17.AR.v1.zip)",
    "COPD",
    "[hum0014.v17.COPD.v1](/files/hum0014/hum0014.v17.COPD.v1.zip)",
    "[Dictionary file](/files/hum0014/README.txt)",
  ].join("\n")

  it("takes the caption away with the dataset line under it, and keeps the lines no dataset owns", () => {
    const result = splitSharedBlock(block("NBDC Dataset Accession", cell), LABELS, NO_STUDIES)

    expect(ownText(result, "hum0014.v17.COPD.v1", "NBDC Dataset Accession")).toBe([
      "COPD",
      "[hum0014.v17.COPD.v1](/files/hum0014/hum0014.v17.COPD.v1.zip)",
      "[Dictionary file](/files/hum0014/README.txt)",
    ].join("\n"))
    expect(ownText(result, "hum0014.v17.AR.v1", "NBDC Dataset Accession")).toBe([
      "不整脈",
      "[hum0014.v17.AR.v1](/files/hum0014/hum0014.v17.AR.v1.zip)",
      "[Dictionary file](/files/hum0014/README.txt)",
    ].join("\n"))
  })

  it("takes away a group heading once every line under it has gone", () => {
    const grouped = ["血球数", "赤血球数", "JGAD000155", "血糖・脂質関連", "総コレステロール", "JGAD000144", "HDLコレステロール", "JGAD000145"].join("\n")
    const result = splitSharedBlock(block("NBDC Dataset Accession", grouped), ["JGAD000155", "JGAD000144", "JGAD000145"], NO_STUDIES)

    expect(ownText(result, "JGAD000155", "NBDC Dataset Accession")).toBe("血球数\n赤血球数\nJGAD000155")
    expect(ownText(result, "JGAD000145", "NBDC Dataset Accession")).toBe("血糖・脂質関連\nHDLコレステロール\nJGAD000145")
  })

  it("reads a table that repeats the group heading on every row", () => {
    const rows = ["血糖・脂質関連", "総コレステロール", "JGAD000144", "血糖・脂質関連", "HDLコレステロール", "JGAD000145"].join("\n")
    const result = splitSharedBlock(block("NBDC Dataset Accession", rows), ["JGAD000144", "JGAD000145"], NO_STUDIES)

    expect(ownText(result, "JGAD000145", "NBDC Dataset Accession")).toBe("血糖・脂質関連\nHDLコレステロール\nJGAD000145")
    expect(ownText(result, "JGAD000144", "NBDC Dataset Accession")).toBe("血糖・脂質関連\n総コレステロール\nJGAD000144")
  })

  it("leaves a heading over other datasets' lines in any other cell", () => {
    const result = splitSharedBlock(block("Total Data Volume", "腫瘍組織:\nJGAD000001: 88 GB\nJGAD000002: 32 GB"), ["JGAD000001", "JGAD000002"], NO_STUDIES)

    expect(ownText(result, "JGAD000002", "Total Data Volume")).toBe("腫瘍組織:\nJGAD000002: 32 GB")
  })
})

describe("a line naming an accession outside the block", () => {
  it("drops it for every dataset in the block rather than keeping it for any of them", () => {
    // Real text from hum0018-v3 (WES): two lines of the five name JGAD ids
    // that are not among this smaller block's own three siblings.
    const text = [
      "[JGAD000009](https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000009): 神経筋変性疾患、対照健常者",
      "[JGAD000448](https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000448): CMT",
      "[JGAD000488](https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000488): FTD",
      "[JGAD000510](https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000510): Sporadic ALS",
      "[JGAD000449](https://ddbj.nig.ac.jp/search/entry/jga-dataset/JGAD000449): DRPLA",
    ].join("\n")
    const result = splitSharedBlock(
      block("Japanese Genotype-phenotype Archive Dataset Accession", text),
      ["JGAD000009", "JGAD000448", "JGAD000488"],
      NO_STUDIES,
    )
    for (const label of ["JGAD000009", "JGAD000448", "JGAD000488"]) {
      const own = ownText(result, label, "Japanese Genotype-phenotype Archive Dataset Accession")
      expect(own).not.toContain("JGAD000510")
      expect(own).not.toContain("JGAD000449")
    }
    expect(ownText(result, "JGAD000009", "Japanese Genotype-phenotype Archive Dataset Accession")).toContain("神経筋変性疾患")
    expect(result.stats).toEqual({ split: 2, shared: 0, review: 0, hand: 0 })
  })

  it("drops a foreign line even when nothing in the cell is owned, leaving the shared remainder", () => {
    const text = "共通の説明\nJGAD999999: よそのデータセットの値"
    const result = splitSharedBlock(
      block("Materials and Participants", text),
      ["JGAD000001", "JGAD000002"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000001", "Materials and Participants")).toBe("共通の説明")
    expect(ownText(result, "JGAD000002", "Materials and Participants")).toBe("共通の説明")
    expect(result.stats).toEqual({ split: 0, shared: 2, review: 0, hand: 0 })
  })

  it("resolves a foreign line through a study just as it does a bare accession", () => {
    const jgasToJgad = jgadsByStudy([["JGAD999999", "JGAS999999"]])
    const text = "共通の説明\n【JGAS999999】よその研究の内訳"
    const result = splitSharedBlock(block("Materials and Participants", text), ["JGAD000001", "JGAD000002"], jgasToJgad)
    expect(ownText(result, "JGAD000001", "Materials and Participants")).toBe("共通の説明")
    expect(ownText(result, "JGAD000002", "Materials and Participants")).toBe("共通の説明")
  })
})

describe("a line naming no accession at all", () => {
  it("stays for every dataset in the block", () => {
    const result = splitSharedBlock(
      block("Materials and Participants", "常染色体: 5,961,600\nX染色体: 147,353"),
      ["JGAD000001", "JGAD000002"],
      NO_STUDIES,
    )
    expect(ownText(result, "JGAD000001", "Materials and Participants")).toContain("5,961,600")
    expect(ownText(result, "JGAD000001", "Materials and Participants")).toContain("147,353")
    expect(ownText(result, "JGAD000002", "Materials and Participants")).toContain("5,961,600")
  })

  it("keeps a blank line between two keyed lines for every dataset", () => {
    const text = "JGAD000001: 88 GB\n\nJGAD000002: 32 GB"
    const result = splitSharedBlock(block("Total Data Volume", text), ["JGAD000001", "JGAD000002"], NO_STUDIES)
    // The blank line has no owner and stays; it is not a third dataset's line.
    expect(ownText(result, "JGAD000001", "Total Data Volume")).toContain("88 GB")
    expect(ownText(result, "JGAD000001", "Total Data Volume")).not.toContain("32 GB")
    expect(ownText(result, "JGAD000002", "Total Data Volume")).toContain("32 GB")
  })

  it("treats a block with no accession anywhere as a plain share, copied to every dataset", () => {
    const result = splitSharedBlock(
      { Platform: { ja: "Illumina HiSeq 2500", en: "Illumina HiSeq 2500" } },
      ["JGAD000001", "JGAD000002", "JGAD000003"],
      NO_STUDIES,
    )
    expect(result.stats).toEqual({ split: 0, shared: 2, review: 0, hand: 0 })
    for (const label of ["JGAD000001", "JGAD000002", "JGAD000003"]) {
      expect(ownText(result, label, "Platform")).toBe("Illumina HiSeq 2500")
    }
    expect(result.review).toEqual([])
  })
})

describe("a cell the splitting rules cannot settle", () => {
  it("leaves the value intact for every dataset when a line names more than one of the block's own", () => {
    // Real text from hum0113 v3: one line covers two siblings at once, and
    // the third line's accession is a typo the regexes cannot recognise.
    const text = "whole blood, iPS-derived neurons, and iPS-derived NSCs "
      + "(JGAD000129 and JGAD000211): Single-end\niPS-derived neurons and NSCs (JGA000429): Paired-end"
    const result = splitSharedBlock(
      block("Read Type", text),
      ["JGAD000129", "JGAD000211", "JGAD000429"],
      NO_STUDIES,
    )
    expect(result.stats).toEqual({ split: 0, shared: 0, review: 2, hand: 0 }) // ja and en both
    for (const label of ["JGAD000129", "JGAD000211", "JGAD000429"]) {
      expect(ownText(result, label, "Read Type")).toBe(text)
    }
    expect(result.review).toHaveLength(6) // 3 datasets x 2 languages
    expect(result.review[0]).toMatchObject({ key: "Read Type", lang: "ja", value: text })
  })

  it("does not resolve an unrecognisable accession, so the typo line alone stays shared", () => {
    const result = splitSharedBlock(
      block("Read Type", "iPS-derived neurons and NSCs (JGA000429): Paired-end"),
      ["JGAD000129", "JGAD000429"],
      NO_STUDIES,
    )
    expect(result.stats).toEqual({ split: 0, shared: 2, review: 0, hand: 0 })
  })

  it("flags a JGAS that resolves to more than one of the block's own datasets", () => {
    // The study covers two datasets that are both in this block, so which of
    // the two the line's value belongs to cannot be read from the line alone.
    const jgasToJgad = jgadsByStudy([["JGAD000001", "JGAS000001"], ["JGAD000002", "JGAS000001"]])
    const result = splitSharedBlock(
      block("Materials and Participants", "【JGAS000001】9症例"),
      ["JGAD000001", "JGAD000002"],
      jgasToJgad,
    )
    expect(result.stats).toEqual({ split: 0, shared: 0, review: 2, hand: 0 })
    expect(result.review[0]?.reason).toContain("複数 dataset")
  })

  it("flags a key that lists only some of the block's own datasets", () => {
    // Real shape from hum0402/hum0356: fewer accession lines than siblings.
    const result = splitSharedBlock(
      block("Sequence Read Archive Accession", "[DRA016537](https://ddbj.nig.ac.jp/resource/sra-submission/DRA016537)"),
      ["DRA016537", "E-GEAD-622"],
      NO_STUDIES,
    )
    expect(result.stats).toEqual({ split: 0, shared: 0, review: 2, hand: 0 })
    expect([...new Set(result.review.map((r) => r.dataset))].sort()).toEqual(["DRA016537", "E-GEAD-622"])
    expect(result.review[0]?.reason).toContain("E-GEAD-622")
  })
})

describe("a cell of groups under headings alone on their lines", () => {
  const studies = jgadsByStudy([["JGAD000001", "JGAS000001"], ["JGAD000002", "JGAS000002"]])
  const key = "Materials and Participants"

  it("gives each dataset the lines under its own heading, and the lines above the first heading to all", () => {
    const text = "急性骨髄芽球性白血病\n【JGAS000001】\nAML：4症例\n正常細胞：4検体\n【JGAS000002】\nAML：4症例\n正常細胞：2検体"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], studies)
    expect(ownText(result, "JGAD000001", key)).toBe("急性骨髄芽球性白血病\n【JGAS000001】\nAML：4症例\n正常細胞：4検体")
    expect(ownText(result, "JGAD000002", key)).toBe("急性骨髄芽球性白血病\n【JGAS000002】\nAML：4症例\n正常細胞：2検体")
    expect(result.stats.split).toBe(2)
  })

  it("keeps a line under a heading with the heading's dataset though it names a dataset outside the block", () => {
    const text = "【JGAD000001】\nJGAD000220 の WGS の vcf\n【JGAD000002】\nJGAD000495 の WGS の vcf"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], NO_STUDIES)
    expect(ownText(result, "JGAD000001", key)).toBe("【JGAD000001】\nJGAD000220 の WGS の vcf")
    expect(ownText(result, "JGAD000002", key)).toBe("【JGAD000002】\nJGAD000495 の WGS の vcf")
  })

  it("reads the English page's square brackets alone on a line, but not a link, as a heading", () => {
    const text = "[JGAS000001]\nAML: 4 cases\n[JGAS000002]\n[JGAD000009](https://example.org) cited"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], studies)
    expect(ownText(result, "JGAD000001", key)).toBe("[JGAS000001]\nAML: 4 cases")
    expect(ownText(result, "JGAD000002", key)).toBe("[JGAS000002]\n[JGAD000009](https://example.org) cited")
  })

  it("leaves the cell whole for review where a heading names only a dataset outside the block", () => {
    const text = "【JGAS000001】\nAML：4症例\n【JGAD000009】\nAML：2症例\n【JGAS000002】\nMDS：30症例"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], studies)
    expect(ownText(result, "JGAD000001", key)).toBe(text)
    expect(result.stats.review).toBe(2)
  })

  it("reads lines as before where a heading naming a dataset has words after it", () => {
    const text = "【JGAS000001】\nAML：4症例\n【JGAS000002】MDS：30症例"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], studies)
    expect(ownText(result, "JGAD000001", key)).toBe("【JGAS000001】\nAML：4症例")
    expect(ownText(result, "JGAD000002", key)).toBe("AML：4症例\n【JGAS000002】MDS：30症例")
  })

  it("does not read a heading alone on its line that names nothing as a group", () => {
    const text = "【WGS】\nJGAD000001：1,026名\n【reference panel】\nJGAD000002：2,504名"
    const result = splitSharedBlock(block(key, text), ["JGAD000001", "JGAD000002"], NO_STUDIES)
    expect(ownText(result, "JGAD000001", key)).toBe("【WGS】\nJGAD000001：1,026名\n【reference panel】")
  })
})

describe("ja and en are decided independently", () => {
  it("splits one language while the other is left for review", () => {
    const data: BlockData = {
      "Total Data Volume": {
        ja: "JGAD000001: 88 GB\nJGAD000002: 32 GB",
        en: "whole cohort (JGAD000001 and JGAD000002): 120 GB",
      },
    }
    const result = splitSharedBlock(data, ["JGAD000001", "JGAD000002"], NO_STUDIES)
    expect(result.stats).toEqual({ split: 1, shared: 0, review: 1, hand: 0 })
    expect(result.perDataset.get("JGAD000001")?.["Total Data Volume"]?.ja).toContain("88 GB")
    expect(result.perDataset.get("JGAD000001")?.["Total Data Volume"]?.en).toBe(data["Total Data Volume"]?.en)
    expect(result.review.filter((r) => r.lang === "en")).toHaveLength(2)
  })
})

describe("blockDataFromEs", () => {
  it("reads the text of each language and drops the html", () => {
    const data = blockDataFromEs({
      "Total Data Volume": { ja: { text: "88 GB", rawHtml: "<p>88 GB</p>" }, en: { text: "88 GB" } },
    })
    expect(data["Total Data Volume"]).toEqual({ ja: "88 GB", en: "88 GB" })
  })

  it("turns a missing cell or a missing language into an empty string", () => {
    expect(blockDataFromEs(null)).toEqual({})
    expect(blockDataFromEs({ Platform: {} })).toEqual({ Platform: { ja: "", en: "" } })
  })
})

describe("jgadsByStudy", () => {
  it("groups every dataset registered under the same study", () => {
    const map = jgadsByStudy([["JGAD000001", "JGAS000001"], ["JGAD000002", "JGAS000001"], ["JGAD000003", "JGAS000002"]])
    expect(map.get("JGAS000001")).toEqual(["JGAD000001", "JGAD000002"])
    expect(map.get("JGAS000002")).toEqual(["JGAD000003"])
  })

  it("is empty for no rows", () => {
    expect(jgadsByStudy([]).size).toBe(0)
  })
})

describe("a cell divided by hand", () => {
  const text = "【JGAD000001, JGAD000002】共通の検体：10名"
  const labels = ["JGAD000001", "JGAD000002"]
  const divided = new Map([[
    handKey(labels, "Materials and Participants", "ja", text),
    new Map([["JGAD000001", "共通の検体：4名"], ["JGAD000002", "共通の検体：6名"]]),
  ]])

  it("takes the division written for exactly this text, and lists it for no one", () => {
    const result = splitSharedBlock(block("Materials and Participants", text, "x"), labels, NO_STUDIES, divided)

    expect(ownText(result, "JGAD000001", "Materials and Participants")).toBe("共通の検体：4名")
    expect(ownText(result, "JGAD000002", "Materials and Participants")).toBe("共通の検体：6名")
    expect(result.stats.hand).toBe(1)
    expect(result.review).toEqual([])
  })

  it("finds the division whatever order the block lists its datasets in", () => {
    const result = splitSharedBlock(block("Materials and Participants", text, "x"), [...labels].reverse(), NO_STUDIES, divided)

    expect(result.stats.hand).toBe(1)
  })

  it("does not apply a division to a text that has changed since it was written", () => {
    const result = splitSharedBlock(block("Materials and Participants", `${text}。`, "x"), labels, NO_STUDIES, divided)

    expect(result.stats.hand).toBe(0)
    expect(result.review.map((one) => one.block)).toEqual([labels, labels])
  })

  it("refuses a division that does not name every dataset of the block", () => {
    const partial = new Map([[handKey(labels, "K", "ja", text), new Map([["JGAD000001", "x"]])]])

    expect(() => splitSharedBlock(block("K", text), labels, NO_STUDIES, partial)).toThrow(/JGAD000001 for a block of JGAD000001, JGAD000002/)
  })
})
