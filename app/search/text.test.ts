import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"

import { searchTextOf } from "./text"

describe("searchTextOf", () => {
  it("sends each side of a translated pair to its own language", () => {
    const text = searchTextOf({ title: { state: "value", value: { ja: "日本語", en: "English" } } })
    expect(text.ja).toContain("日本語")
    expect(text.ja).not.toContain("English")
    expect(text.en).toContain("English")
    expect(text.en).not.toContain("日本語")
  })

  it("sends a single-valued field to both languages", () => {
    const text = searchTextOf({ doi: { state: "value", value: "10.1000/xyz" } })
    expect(text.ja).toContain("10.1000/xyz")
    expect(text.en).toContain("10.1000/xyz")
  })

  it("keeps the language of a link however deep it sits", () => {
    const text = searchTextOf({
      summary: {
        url: {
          state: "value",
          value: {
            ja: [{ id: "l1", url: "https://example.jp/", text: "研究室ページ" }],
            en: [{ id: "l2", url: "https://example.com/", text: "Lab page" }],
          },
        },
      },
    })
    expect(text.ja).toContain("研究室ページ")
    expect(text.ja).not.toContain("Lab page")
    expect(text.en).toContain("Lab page")
    expect(text.en).not.toContain("研究室ページ")
  })

  it("leaves out identities, so searching for one cannot match by accident", () => {
    const text = searchTextOf({
      datasetIds: ["019fd0a5-0000-7000-8000-000000000001"],
      grants: [{ id: "grant-1", title: { state: "value", value: { ja: "助成", en: "Grant" } } }],
      values: [{ keyId: "019fd0a5-0000-7000-8000-000000000002", slot: { state: "value", value: { kind: "vocabulary", termIds: ["019fd0a5-0000-7000-8000-000000000003"] } } }],
    })
    expect(text.ja).not.toContain("019fd0a5")
    expect(text.en).not.toContain("019fd0a5")
    expect(text.ja).not.toContain("grant-1")
    expect(text.ja).toContain("助成")
  })

  it("puts the labels it is handed into both languages", () => {
    const text = searchTextOf(emptyResearchContent(), ["hum0001", "hum0001-v2"])
    expect(text.ja).toContain("hum0001-v2")
    expect(text.en).toContain("hum0001-v2")
  })

  it("produces nothing for content nobody has filled in", () => {
    expect(searchTextOf(emptyResearchContent())).toEqual({ ja: "", en: "" })
    expect(searchTextOf(emptyDatasetContent())).toEqual({ ja: "", en: "" })
  })

  it("never invents a string that is not in the content", () => {
    const leaf = fc.string({ minLength: 1 })
    const content = fc.letrec((tie) => ({
      node: fc.oneof(
        { depthSize: "small" },
        leaf,
        fc.record({ ja: leaf, en: leaf }),
        fc.array(tie("node")),
        fc.dictionary(fc.string({ minLength: 1 }), tie("node")),
      ),
    })).node
    fc.assert(fc.property(content, (value) => {
      const seen: string[] = []
      const collect = (node: unknown): void => {
        if (typeof node === "string") seen.push(node)
        else if (Array.isArray(node)) node.forEach(collect)
        else if (node && typeof node === "object") Object.values(node).forEach(collect)
      }
      collect(value)
      const text = searchTextOf(value)
      for (const word of [...text.ja.split(" "), ...text.en.split(" ")]) {
        if (word === "") continue
        expect(seen.some((s) => s.split(" ").includes(word))).toBe(true)
      }
    }))
  })
})
