import { describe, expect, it } from "vitest"

import type { RichText, Slot } from "~/content/types"

import { cleanseCharacters, cleanseContent, cleanseEnglish, cleanseMarkdown, cleansePunctuation, cleanseRich, noCounts, pairedBrackets, splitGrantIds } from "./cleansing"

const lines = (...texts: string[]): RichText => texts.map((text) => text === "" ? [] : [{ text }])
const prose = (...texts: string[]): Slot<RichText> => ({ state: "value", value: lines(...texts) })

describe("cleanseRich", () => {
  it("turns the no-break spaces the old pages spaced and indented with into nothing", () => {
    const { content } = cleanseContent({ v: prose("\u00a0", "\u00a0\u00a0\u00a0対象: 11検体", "\u00a0", "（卵子）") })

    expect(content.v).toEqual(prose("対象: 11検体", "", "（卵子）"))
  })

  it("trims every line and turns a line of spaces into one blank line", () => {
    const rich = lines(" ", "   対象: 11検体", "　", "", "（卵子） ", " ")

    expect(cleanseRich(rich, noCounts())).toEqual(lines("対象: 11検体", "", "（卵子）"))
  })

  it("removes a line that only asks the reader to click the link above, in either bracket and either language", () => {
    const counts = noCounts()
    const rich: RichText = [
      [{ text: "hum0014.v1.freq.v1", href: "/files/hum0014/hum0014.v1.freq.v1.zip" }],
      [{ text: "（データのダウンロードは上記Dataset IDをクリックしてください）" }],
      [{ text: "(データのダウンロードは上記データIDをクリックし、遷移先のサイトの各Dataset IDをクリックしてください)" }],
      [{ text: "(Click the trait names to download the gwas summary statistics)" }],
      [{ text: "(Click each data name to download the file)" }],
    ]

    expect(cleanseRich(rich, counts)).toEqual([rich[0]])
    expect(counts.instructions).toBe(4)
  })

  it("keeps a line that mentions downloading but is not an instruction, and one holding a link", () => {
    const rich: RichText = [
      [{ text: "・染色毎の一括ダウンロード" }],
      [{ text: "(Click the Dataset ID to download the file)", href: "/files/x.zip" }],
    ]

    expect(cleanseRich(rich, noCounts())).toEqual(rich)
  })

  it("keeps the links of a line and only trims its ends", () => {
    const rich: RichText = [[{ text: " see " }, { text: "JGAS000006", href: "https://ddbj.nig.ac.jp/" }, { text: " here " }]]

    expect(cleanseRich(rich, noCounts())).toEqual([[{ text: "see " }, { text: "JGAS000006", href: "https://ddbj.nig.ac.jp/" }, { text: " here" }]])
  })

  it("returns an empty value when every line was spaces or an instruction", () => {
    expect(cleanseRich(lines(" ", "(Click the link above to download the files)"), noCounts())).toEqual([])
  })

  it("counts a value only when its lines changed", () => {
    const counts = noCounts()
    cleanseRich(lines("a", "", "b"), counts)
    expect(counts.prose).toBe(0)
    cleanseRich(lines("a", "", "", "b"), counts)
    expect(counts.prose).toBe(1)
  })
})

describe("cleanseCharacters", () => {
  it("makes full-width letters and digits ASCII", () => {
    expect(cleanseCharacters("１．ＣＯＶＩＤ－１９ ｈｕｍ", noCounts())).toBe("1．COVID－19 hum")
  })

  it("turns the Kangxi radicals a PDF copy leaves into the ideographs they look like", () => {
    expect(cleanseCharacters("⽇本学術振興会 ⽀援 ⾰新 ⽪膚 国⽴ 第⼀", noCounts())).toBe("日本学術振興会 支援 革新 皮膚 国立 第一")
  })

  it("makes a run of spaces holding a no-break space one space", () => {
    expect(cleanseCharacters("疾患群:\u00a0\u00a0 \u00a0自己免疫疾患", noCounts())).toBe("疾患群: 自己免疫疾患")
  })

  it("makes a full-width space, or a run of spaces holding one, one space", () => {
    expect(cleanseCharacters("凍結検体\u3000腫瘍組織", noCounts())).toBe("凍結検体 腫瘍組織")
    expect(cleanseCharacters("< 1000、もしくは \u3000\u3000> 4000", noCounts())).toBe("< 1000、もしくは > 4000")
  })

  it("makes a kana and the voicing mark typed after it one letter", () => {
    expect(cleanseCharacters("\u3053\u3099教示く\u305f\u3099さい \u30cf\u309aネル", noCounts())).toBe("ご教示ください パネル")
  })

  it("makes a full-width slash ASCII", () => {
    expect(cleanseCharacters("PBMC／CD4+ T細胞", noCounts())).toBe("PBMC/CD4+ T細胞")
  })

  it("removes control characters but keeps line breaks and tabs", () => {
    expect(cleanseCharacters("a\u0005b\u0006\nc\td", noCounts())).toBe("ab\nc\td")
  })

  it("removes zero-width spaces", () => {
    expect(cleanseCharacters("Medicine\u200b, Center\ufeff、\u200bNanyang", noCounts())).toBe("Medicine, Center、Nanyang")
  })

  it("removes markdown's escapes", () => {
    expect(cleanseCharacters("reference\\_accession: GCF\\_000001405.13 \\[DNA\\]", noCounts()))
      .toBe("reference_accession: GCF_000001405.13 [DNA]")
    expect(cleanseCharacters("1\\. 東京大学 \\> 10 kb", noCounts())).toBe("1. 東京大学 > 10 kb")
  })

  it("leaves Japanese punctuation and kana alone", () => {
    const text = "食道がん（C159）、胃がん（C169）：１例"
    expect(cleanseCharacters(text, noCounts())).toBe("食道がん（C159）、胃がん（C169）：1例")
  })

  it("counts each rule once per string", () => {
    const counts = noCounts()
    cleanseCharacters("ＡＢ\\_", counts)
    cleanseCharacters("plain", counts)
    expect(counts).toMatchObject({ characters: 1, escapes: 1 })
  })
})

describe("cleansePunctuation", () => {
  it("makes typographic quote marks ASCII", () => {
    expect(cleansePunctuation("Parkinson’s ‘quantifier.pl’ “benign”", noCounts())).toBe("Parkinson's 'quantifier.pl' \"benign\"")
  })

  it("makes every dash a hyphen-minus", () => {
    expect(cleansePunctuation("Hardy–Weinberg Hardy‒Weinberg Multi‐institutional data—including ― 追加解析 ― 研究助成－がん領域", noCounts()))
      .toBe("Hardy-Weinberg Hardy-Weinberg Multi-institutional data-including - 追加解析 - 研究助成-がん領域")
  })

  it("keeps the long vowel mark and the minus sign", () => {
    expect(cleansePunctuation("データベース −80℃", noCounts())).toBe("データベース −80℃")
  })

  it("counts a string once", () => {
    const counts = noCounts()
    cleansePunctuation("’–”", counts)
    cleansePunctuation("plain", counts)
    expect(counts.punctuation).toBe(1)
  })
})

describe("cleanseEnglish", () => {
  it("makes full-width brackets, colons and commas ASCII", () => {
    expect(cleanseEnglish("GenCall software（GenomeStudio）", noCounts())).toBe("GenCall software (GenomeStudio)")
    expect(cleanseEnglish("Patients：Autoimmune，Allergy、Other", noCounts())).toBe("Patients: Autoimmune, Allergy, Other")
  })

  it("puts the space English puts before an opening bracket", () => {
    expect(cleanseEnglish("JGAD000275：14.3 GB（fastq）", noCounts())).toBe("JGAD000275: 14.3 GB (fastq)")
    expect(cleanseEnglish("minimac（ver. 0.1.1） [imputation]", noCounts())).toBe("minimac (ver. 0.1.1) [imputation]")
  })

  it("puts no space where a bracket opens the text, follows a space, or follows another opening bracket", () => {
    expect(cleanseEnglish("（bam, fastq）", noCounts())).toBe("(bam, fastq)")
    expect(cleanseEnglish("NGS （Exome）", noCounts())).toBe("NGS (Exome)")
    expect(cleanseEnglish("[（x）]", noCounts())).toBe("[(x)]")
  })

  it("puts a space after a closing bracket a word follows, and none before punctuation", () => {
    expect(cleanseEnglish("A（x）B", noCounts())).toBe("A (x) B")
    expect(cleanseEnglish("A（x）, B（y）.", noCounts())).toBe("A (x), B (y).")
  })

  it("leaves ASCII brackets as they were written", () => {
    expect(cleanseEnglish("KMT2A(MLL), WT1(WT-1)", noCounts())).toBe("KMT2A(MLL), WT1(WT-1)")
  })

  it("does not leave a space inside a bracket", () => {
    expect(cleanseEnglish("（ Exome ）", noCounts())).toBe("(Exome)")
  })
})

describe("pairedBrackets", () => {
  it("closes a bracket with the width it was opened with", () => {
    expect(pairedBrackets("ウイルスキャプチャーシーケンス（NGS)、Exome（NGS）", noCounts())).toBe("ウイルスキャプチャーシーケンス（NGS）、Exome（NGS）")
    expect(pairedBrackets("【JGAS000646】Cyclin O (CCNO）バリアント", noCounts())).toBe("【JGAS000646】Cyclin O (CCNO)バリアント")
  })

  it("pairs the inner brackets first", () => {
    expect(pairedBrackets("VCMM（Shigemizu et al. Sci Rep (2013))", noCounts())).toBe("VCMM（Shigemizu et al. Sci Rep (2013)）")
  })

  it("leaves pairs that each keep one width, whichever it is", () => {
    const text = "アルツハイマー病（AD）とサロゲートマーカー (surrogate marker)、KMT2A(MLL)"
    expect(pairedBrackets(text, noCounts())).toBe(text)
  })

  it("leaves a closing bracket with nothing open, and an opening one never closed", () => {
    expect(pairedBrackets("1) 同義変異 （未確定", noCounts())).toBe("1) 同義変異 （未確定")
  })

  it("counts a string once however many brackets it closes", () => {
    const counts = noCounts()
    pairedBrackets("（a)（b)", counts)
    pairedBrackets("（a）", counts)
    expect(counts.brackets).toBe(1)
  })
})

describe("cleanseContent", () => {
  it("closes brackets on the Japanese side only, across the spans of a line", () => {
    const span = (text: string, href?: string) => (href === undefined ? { text } : { text, href })
    const { content } = cleanseContent({ text: {
      ja: { state: "value", value: [[span("VCMM（"), span("Shigemizu et al. (2013)", "https://doi.org/x"), span(")")]] },
      en: { state: "value", value: [[span("VCMM（Shigemizu et al. (2013))")]] },
    } })

    expect(content.text.ja).toEqual({ state: "value", value: [[span("VCMM（"), span("Shigemizu et al. (2013)", "https://doi.org/x"), span("）")]] })
    expect(content.text.en).toEqual({ state: "value", value: [[span("VCMM (Shigemizu et al. (2013))")]] })
  })

  it("applies the English rules to the English side of a pair only", () => {
    const { content } = cleanseContent({ text: { ja: prose("疾患群：自己免疫疾患"), en: prose("Patients：Autoimmune") } })

    expect(content.text.ja).toEqual(prose("疾患群：自己免疫疾患"))
    expect(content.text.en).toEqual(prose("Patients: Autoimmune"))
  })

  it("leaves identifiers, addresses and file names as written", () => {
    const input = {
      id: "ＩＤ\\_1",
      datasetId: "ＮＨＡ",
      termIds: ["ｔ"],
      fileSelection: ["ＡＢ\\_.zip"],
      url: { ja: { state: "value", value: [{ id: "l", url: "https://x/\\_", text: "ａ" }] }, en: { state: "unknown" } },
      spans: [[{ text: "ｘ", href: "/files/ＡＢ.zip" }]],
    }
    const { content } = cleanseContent(input)

    expect(content).toEqual({ ...input, url: { ...input.url, ja: { state: "value", value: [{ id: "l", url: "https://x/\\_", text: "a" }] } }, spans: [[{ text: "x", href: "/files/ＡＢ.zip" }]] })
  })

  it("keeps the text of link syntax in a single-line value", () => {
    const { content, counts } = cleanseContent({ title: { ja: { state: "value", value: "[研究](https://example.org/a)の題名" }, en: { state: "value", value: "[Title](/hum0001)" } } })

    expect(content.title).toEqual({ ja: { state: "value", value: "研究の題名" }, en: { state: "value", value: "Title" } })
    expect(counts.linkSyntax).toBe(2)
  })

  it("leaves unknown and not-applicable values alone", () => {
    const input = { a: { ja: { state: "unknown" }, en: { state: "not-applicable" } } }

    expect(cleanseContent(input).content).toEqual(input)
  })

  it("cleans the strings of lists that are not prose, such as grant numbers", () => {
    expect(cleanseContent({ grantIds: ["ＪＰ１９ｄｍ", "16H06279"] }).content).toEqual({ grantIds: ["JP19dm", "16H06279"] })
  })

  it("makes quote marks and dashes ASCII on both sides of a pair and in prose, but not in addresses", () => {
    const input = {
      title: { ja: { state: "value", value: "“Clinical Sequencing”の有用性" }, en: { state: "value", value: "Parkinson’s disease" } },
      text: { ja: prose("血小板減少－：196症例"), en: prose("Hardy–Weinberg") },
      grantIds: ["H22－難治-一般-058"],
      doi: { state: "value", value: "https://doi.org/10.1/a–b" },
    }
    const { content, counts } = cleanseContent(input)

    expect(content).toEqual({
      title: { ja: { state: "value", value: "\"Clinical Sequencing\"の有用性" }, en: { state: "value", value: "Parkinson's disease" } },
      text: { ja: prose("血小板減少-：196症例"), en: prose("Hardy-Weinberg") },
      grantIds: ["H22-難治-一般-058"],
      doi: input.doi,
    })
    expect(counts.punctuation).toBe(5)
  })
})

describe("cleanseMarkdown", () => {
  // The page's renderer, closely enough: `***x***` is emphasis unless a space sits inside the
  // marker, and a reference is read as its character only after the emphasis is.
  const render = (markdown: string) => markdown
    .replace(/\*\*\*(\S(?:.*?\S)?)\*\*\*/g, "<em>$1</em>")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/^(\d+)\. /gm, "<li>")

  it("writes a reference as the character where the body renders the same", () => {
    const counts = noCounts()

    expect(cleanseMarkdown("***活用***&#x3057;ていく", render, counts)).toBe("***活用***していく")
    expect(counts.references).toBe(1)
  })

  it("keeps a reference whose character would undo the emphasis around it", () => {
    expect(cleanseMarkdown("***Dataset ID:&#x20;***", render, noCounts())).toBe("***Dataset ID:&#x20;***")
  })

  it("makes full-width letters, digits and spaces ASCII when that only changes the characters shown", () => {
    expect(cleanseMarkdown("**１．　健常者**", render, noCounts())).toBe("**1． 健常者**")
  })

  it("keeps a body whose ASCII digits would start a list", () => {
    const counts = noCounts()

    expect(cleanseMarkdown("１. 健常者", render, counts)).toBe("１. 健常者")
    expect(counts.keptBodies).toBe(1)
  })

  it("keeps markdown's escapes, which are the body's own syntax", () => {
    expect(cleanseMarkdown("\\[2\\]. **Wellcome**", render, noCounts())).toBe("\\[2\\]. **Wellcome**")
  })
})

describe("splitGrantIds", () => {
  it("gives each number written into one entry an entry of its own", () => {
    const counts = noCounts()

    expect(splitGrantIds(["5144, 5274, 5393", "JP19ek0109296"], counts)).toEqual(["5144", "5274", "5393", "JP19ek0109296"])
    expect(counts.grantIds).toBe(1)
  })

  it("leaves an entry with words in it, which is not a list of numbers", () => {
    const ids = ["16H06279 (PAGS)", "臨床1-①: 白血病ゲノムに基づく層別化治療の確立", "2019年度", "H22-3 次がん-一 般-011"]

    expect(splitGrantIds(ids, noCounts())).toEqual(ids)
  })

  it("is applied to the grants of the content", () => {
    expect(cleanseContent({ grants: [{ id: "g", grantIds: ["ＪＰ1, JP2"] }] }).content.grants[0]?.grantIds).toEqual(["JP1", "JP2"])
  })
})
