import { describe, expect, it } from "vitest"

import { recoverRichText, type RecoverContext } from "./richtext-html"

describe("recoverRichText", () => {
  describe("no rawHtml to compare against", () => {
    it("falls back to parsing `text` when rawHtml is null", () => {
      const result = recoverRichText({ text: "plain text", rawHtml: null, lang: "ja" })
      expect(result).toEqual({ value: [[{ text: "plain text" }]], source: "text" })
    })

    it("falls back to parsing `text` when rawHtml is empty", () => {
      const result = recoverRichText({ text: "plain text", rawHtml: "", lang: "ja" })
      expect(result.source).toBe("text")
    })

    it("falls back to parsing `text` when rawHtml is whitespace only", () => {
      const result = recoverRichText({ text: "plain text", rawHtml: "   \n  ", lang: "ja" })
      expect(result.source).toBe("text")
      expect(result.value).toEqual([[{ text: "plain text" }]])
    })

    it("produces nothing for a value nobody filled in", () => {
      expect(recoverRichText({ text: "", rawHtml: null, lang: "ja" })).toEqual({ value: [], source: "text" })
    })
  })

  describe("rawHtml that agrees with text", () => {
    it("reads a line break `text` had flattened into a space", () => {
      const result = recoverRichText({
        text: "line1 line2",
        rawHtml: "<span>line1<br>line2</span>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "line1" }], [{ text: "line2" }]],
        source: "rawHtml",
      })
    })

    it("reads a line break from every `<br>` spelling", () => {
      for (const br of ["<br>", "<br/>", "<br />"]) {
        const result = recoverRichText({ text: "a b", rawHtml: `<p>a${br}b</p>`, lang: "ja" })
        expect(result.value).toEqual([[{ text: "a" }], [{ text: "b" }]])
        expect(result.source).toBe("rawHtml")
      }
    })

    it("reads a paragraph boundary as a line break, not a blank paragraph", () => {
      const result = recoverRichText({
        text: "first second",
        rawHtml: "<p>first</p><p>second</p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "first" }], [{ text: "second" }]],
        source: "rawHtml",
      })
    })

    it("flattens nested tags, dropping formatting with no v2 representation", () => {
      const result = recoverRichText({
        text: "bold and more",
        rawHtml: "<div><p><span><strong>bold</strong> and more</span></p></div>",
        lang: "en",
      })
      expect(result).toEqual({ value: [[{ text: "bold and more" }]], source: "rawHtml" })
    })

    it("decodes entities the way a browser would", () => {
      const amp = recoverRichText({ text: "a&b", rawHtml: "<p>a&amp;b</p>", lang: "en" })
      expect(amp).toEqual({ value: [[{ text: "a&b" }]], source: "rawHtml" })

      const nbsp = recoverRichText({ text: "a b", rawHtml: "<p>a&nbsp;b</p>", lang: "ja" })
      expect(nbsp).toEqual({ value: [[{ text: "a b" }]], source: "rawHtml" })
    })

    it("keeps a non-breaking space at the edge of a line, unlike ordinary whitespace", () => {
      const result = recoverRichText({
        text: "  indented line",
        rawHtml: "<p>&nbsp;&nbsp;indented line</p>",
        lang: "ja",
      })
      expect(result).toEqual({ value: [[{ text: "  indented line" }]], source: "rawHtml" })
    })

    it("turns every character of a superscript into its Unicode form when it can", () => {
      const result = recoverRichText({ text: "1.73m2", rawHtml: "<p>1.73m<sup>2</sup></p>", lang: "ja" })
      expect(result).toEqual({ value: [[{ text: "1.73m²" }]], source: "rawHtml" })
    })

    it("keeps a superscript's own characters when they have no Unicode form", () => {
      const result = recoverRichText({ text: "x#1", rawHtml: "<p>x<sup>#1</sup></p>", lang: "en" })
      expect(result).toEqual({ value: [[{ text: "x#1" }]], source: "rawHtml" })
    })

    it("drops a leading field-name heading that only repeats what the caller already knows", () => {
      const result = recoverRichText({
        text: "外耳道扁平上皮がん患者1名から採取。",
        rawHtml: "<span><strong>対象： </strong>外耳道扁平上皮がん患者1名から採取。</span>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "外耳道扁平上皮がん患者1名から採取。" }]],
        source: "rawHtml",
      })
    })

    it("keeps a bold run that is real content rather than a field-name heading", () => {
      const sentence = "This whole sentence is emphasized rather than a field label."
      const result = recoverRichText({
        text: sentence,
        rawHtml: `<p><strong>${sentence}</strong></p>`,
        lang: "en",
      })
      expect(result).toEqual({ value: [[{ text: sentence }]], source: "rawHtml" })
    })

    it("agrees with a `text` that folded a hand-written bullet into markdown's `- `", () => {
      // v1's `text` always writes a hand-written "-"/"*"/"・" bullet as
      // markdown's canonical `- `, so the two only agree once both sides read
      // through the mark the same way.
      const result = recoverRichText({
        text: "intro\n\n- IDC: one\n- DCIS: two",
        rawHtml: "<span>intro</span>\n<span>- IDC: one</span>\n<span>・ DCIS: two</span>",
        lang: "en",
      })
      expect(result.source).toBe("rawHtml")
      expect(result.value).toEqual([
        [{ text: "intro" }],
        [{ text: "- IDC: one" }],
        [{ text: "・ DCIS: two" }],
      ])
    })
  })

  describe("links", () => {
    it("turns a link into a span with its destination", () => {
      const result = recoverRichText({
        text: "see [it](https://example.com/x) here",
        rawHtml: "<p>see <a href=\"https://example.com/x\">it</a> here</p>",
        lang: "en",
      })
      expect(result).toEqual({
        value: [[{ text: "see " }, { text: "it", href: "https://example.com/x" }, { text: " here" }]],
        source: "rawHtml",
      })
    })

    it("shows a link with no visible text as its destination", () => {
      const result = recoverRichText({
        text: "before after",
        rawHtml: "<p>before <a href=\"https://example.com/x\"></a> after</p>",
        lang: "en",
      })
      expect(result.source).toBe("rawHtml")
      expect(result.value).toEqual([[
        { text: "before " },
        { text: "https://example.com/x", href: "https://example.com/x" },
        { text: " after" },
      ]])
    })

    it("keeps a mailto link", () => {
      const result = recoverRichText({
        text: "[mail](mailto:a@example.com)",
        rawHtml: "<p><a href=\"mailto:a@example.com\">mail</a></p>",
        lang: "en",
      })
      expect(result).toEqual({
        value: [[{ text: "mail", href: "mailto:a@example.com" }]],
        source: "rawHtml",
      })
    })

    it("drops a same-page anchor, keeping the label as plain text", () => {
      const result = recoverRichText({
        text: "JGAS000114",
        rawHtml: "<span><a href=\"#JGAS000114\">JGAS000114</a></span>",
        lang: "ja",
      })
      expect(result).toEqual({ value: [[{ text: "JGAS000114" }]], source: "rawHtml" })
    })

    it("keeps a real external link untouched", () => {
      const result = recoverRichText({
        text: "[ext](https://example.com/a)",
        rawHtml: "<p><a href=\"https://example.com/a\">ext</a></p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "ext", href: "https://example.com/a" }]],
        source: "rawHtml",
      })
    })

    it("keeps a site-relative download link untouched", () => {
      const result = recoverRichText({
        text: "[data](/files/hum0014/data.csv)",
        rawHtml: "<p><a href=\"/files/hum0014/data.csv\">data</a></p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "data", href: "/files/hum0014/data.csv" }]],
        source: "rawHtml",
      })
    })

    it("rewrites a Joomla article link to the v2 page an id -> alias map names", () => {
      const ctx: RecoverContext = { articleAliases: new Map([["70", "hum0170-v1"]]) }
      const result = recoverRichText({
        text: "policy",
        rawHtml: "<p><a href=\"index.php?option=com_content&amp;view=article&amp;id=70&amp;Itemid=317&amp;lang=ja\">policy</a></p>",
        lang: "ja",
      }, ctx)
      expect(result).toEqual({
        value: [[{ text: "policy", href: "/research/hum0170/v1" }]],
        source: "rawHtml",
      })
    })

    it("drops a Joomla article link with no entry in the id -> alias map", () => {
      const result = recoverRichText({
        text: "policy",
        rawHtml: "<p><a href=\"index.php?option=com_content&amp;id=70\">policy</a></p>",
        lang: "ja",
      })
      expect(result.source).toBe("rawHtml")
      expect(result.value).toEqual([[{ text: "policy" }]])
      expect(result.note).toContain("dropped 1 link")
    })

    it("rewrites an absolute link to the old portal's own domain", () => {
      const result = recoverRichText({
        text: "[hum0170](https://humandbs.dbcls.jp/hum0170-v1)",
        rawHtml: "<p><a href=\"https://humandbs.dbcls.jp/hum0170-v1\">hum0170</a></p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "hum0170", href: "/research/hum0170/v1" }]],
        source: "rawHtml",
      })
    })

    it("keeps the English prefix when rewriting an absolute link to the English page", () => {
      const result = recoverRichText({
        text: "[hum0170](https://humandbs.dbcls.jp/en/hum0170-v1)",
        rawHtml: "<p><a href=\"https://humandbs.dbcls.jp/en/hum0170-v1\">hum0170</a></p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "hum0170", href: "/en/research/hum0170/v1" }]],
        source: "rawHtml",
      })
    })

    it("keeps an unrecognised internal path unchanged", () => {
      const result = recoverRichText({
        text: "[policy](/nbdc-policy)",
        rawHtml: "<p><a href=\"/nbdc-policy\">policy</a></p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "policy", href: "/nbdc-policy" }]],
        source: "rawHtml",
      })
    })
  })

  describe("the known underscore-corruption regression", () => {
    // A real leaf (hum0427, summary.targets.ja): v1's `text` replaced the `_`
    // in a riken.jp URL with a pair of control-character index markers, while
    // `rawHtml` kept the URL correctly. Recovery has to see these as the same
    // leaf and prefer rawHtml, which also has the field-name heading and
    // the anchor `text` only reaches through a markdown link.
    const rawHtml = "<span><strong>対象： </strong>外耳道扁平上皮がん患者1名から採取した末梢血単核細胞、腫瘍原発巓組織、および腫瘍原発巓組織から樹立した細胞株（計3検体）。細胞株は細胞株（SCEACono2）として理化学研究所バイオリソース研究センターに寄託済（<a href=\"https://cellbank.brc.riken.jp/cell_bank/CellInfo/?cellNo=RCB5515&amp;lang=En\">https://cellbank.brc.riken.jp/cell_bank/CellInfo/?cellNo=RCB5515&amp;lang=En</a>）。</span>"
    const text = "外耳道扁平上皮がん患者1名から採取した末梢血単核細胞、腫瘍原発巓組織、および腫瘍原発巓組織から樹立した細胞株 (計3検体) 。細胞株は細胞株 (SCEACono2) として理化学研究所バイオリソース研究センターに寄託済 ([https://cellbank.brc.riken.jp/cell\u00050\u0006bank/CellInfo/?cellNo=RCB5515&lang=En](https://cellbank.brc.riken.jp/cell_bank/CellInfo/?cellNo=RCB5515&lang=En)) 。"

    it("recovers from rawHtml despite the corrupted underscore in `text`", () => {
      const result = recoverRichText({ text, rawHtml, lang: "ja" })
      expect(result.source).toBe("rawHtml")
      const [line] = result.value
      const link = line?.find((span) => span.href !== undefined)
      expect(link?.href).toBe("https://cellbank.brc.riken.jp/cell_bank/CellInfo/?cellNo=RCB5515&lang=En")
      expect(link?.text).toBe("https://cellbank.brc.riken.jp/cell_bank/CellInfo/?cellNo=RCB5515&lang=En")
    })

    it("still falls back to `text` when a control-character run is not this corruption", () => {
      // A run of the same shape that is not an underscore in disguise: the
      // repair must not eat characters it was not built for.
      const result = recoverRichText({
        text: "value \u0005abc\u0006 tail",
        rawHtml: "<p>value XYZ tail</p>",
        lang: "en",
      })
      expect(result.source).toBe("text")
    })
  })

  describe("a rawHtml value holding more than one row", () => {
    it("picks the one row that matches `text`", () => {
      const result = recoverRichText({
        text: "JGAD000211: iPS細胞由来神経細胞",
        rawHtml: "<p>JGAD000129: 全血</p>\n<p>JGAD000211: iPS細胞由来神経細胞</p>",
        lang: "ja",
      })
      expect(result).toEqual({
        value: [[{ text: "JGAD000211: iPS細胞由来神経細胞" }]],
        source: "split",
        note: "recovered row 2 of 2 in a multi-row rawHtml value",
      })
    })

    it("falls back to `text` when no row matches", () => {
      const result = recoverRichText({
        text: "JGAD999999: not present",
        rawHtml: "<p>JGAD000129: full blood</p>\n<p>JGAD000211: something else</p>",
        lang: "ja",
      })
      expect(result.source).toBe("text")
      expect(result.value).toEqual([[{ text: "JGAD999999: not present" }]])
      expect(result.note).toContain("no row")
    })

    it("falls back to `text` when more than one row matches", () => {
      const result = recoverRichText({
        text: "A: 1",
        rawHtml: "<p>A: 1</p>\n<p>A: 1</p>",
        lang: "ja",
      })
      expect(result.source).toBe("text")
      expect(result.note).toContain("2 rows")
    })
  })

  describe("rawHtml that plainly disagrees with text", () => {
    it("falls back to parsing `text`, with a note for a person to check", () => {
      const result = recoverRichText({
        text: "the current wording",
        rawHtml: "<p>a wording nobody kept in sync</p>",
        lang: "en",
      })
      expect(result.value).toEqual([[{ text: "the current wording" }]])
      expect(result.source).toBe("text")
      expect(result.note).toBeDefined()
    })
  })

  describe("ja/en", () => {
    it("spaces a parenthetical the Japanese way when recovering ja content", () => {
      const result = recoverRichText({
        text: "解析 (HRD) を実施",
        rawHtml: "<p>解析（HRD）を実施</p>",
        lang: "ja",
      })
      expect(result).toEqual({ value: [[{ text: "解析（HRD）を実施" }]], source: "rawHtml" })
    })

    it("does not add spacing around a parenthetical when recovering en content", () => {
      const result = recoverRichText({
        text: "analysis(HRD)",
        rawHtml: "<p>analysis（HRD）</p>",
        lang: "en",
      })
      expect(result).toEqual({ value: [[{ text: "analysis（HRD）" }]], source: "rawHtml" })
    })
  })
})
