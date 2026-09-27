import { describe, expect, it } from "vitest"

import { emptyResearchContent } from "~/content/empty"

import { researchContentInput, type DraftInput, type TextPairInput } from "./form"
import { diffDraftInput } from "./diff"
import { initialImport, initialMerge, listRows, RESEARCH_IMPORT, sourceOrDraft, importFieldPaths } from "./import"

function draft(edit: (content: DraftInput["content"]) => DraftInput["content"]): DraftInput {
  return { content: edit(researchContentInput(emptyResearchContent())) }
}

function pair(ja: string, en: string): TextPairInput {
  return { ja: { state: "value", text: ja }, en: { state: "value", text: en } }
}

describe("sourceOrDraft", () => {
  it("imports the source's language where it has a value and keeps the draft's where it is blank", () => {
    expect(sourceOrDraft(pair("下書き", "draft"), pair("申請", ""))).toEqual(pair("申請", "draft"))
  })

  it("treats a language holding only spaces as blank", () => {
    expect(sourceOrDraft(pair("下書き", "draft"), pair("  ", "application"))).toEqual(pair("下書き", "application"))
  })

  it("imports a state the source marks, since a state is something said", () => {
    const mine = pair("下書き", "draft")
    const theirs: TextPairInput = { ja: { state: "unknown", text: "" }, en: { state: "not-applicable", text: "" } }
    expect(sourceOrDraft(mine, theirs)).toEqual(theirs)
  })

  it("keeps the draft's grant numbers when the source has none, and imports the source's otherwise", () => {
    expect(sourceOrDraft(["JP1"], [])).toEqual(["JP1"])
    expect(sourceOrDraft(["JP1"], ["JP2"])).toEqual(["JP2"])
  })

  it("keeps the draft's links in a language the source leaves without any", () => {
    const mine = {
      ja: { state: "value", links: [{ id: "a", url: "https://a", text: "" }] },
      en: { state: "value", links: [] },
    }
    const theirs = {
      ja: { state: "value", links: [] },
      en: { state: "value", links: [{ id: "b", url: "https://b", text: "" }] },
    }
    expect(sourceOrDraft(mine, theirs)).toEqual({ ja: mine.ja, en: theirs.en })
  })
})

describe("initialImport", () => {
  it("lists the draft's providers first and the source's new one after, all of them kept", () => {
    const kept = { id: "p1", name: pair("山田", "Yamada"), organization: { name: pair("", "") } }
    const added = { id: "p2", name: pair("鈴木", "Suzuki"), organization: { name: pair("", "") } }
    const mine = draft((c) => ({ ...c, dataProviders: [kept] }))
    const theirs = draft((c) => ({ ...c, dataProviders: [added] }))

    expect(listRows(RESEARCH_IMPORT, mine, theirs, "dataProviders").map((row) => [row.id, row.inMine, row.inTheirs]))
      .toEqual([["p1", true, false], ["p2", false, true]])
    expect(initialImport(RESEARCH_IMPORT, mine, theirs).content.dataProviders).toEqual([kept, added])
  })

  it("writes the source's reading into a provider both sides hold", () => {
    const mine = draft((c) => ({
      ...c,
      dataProviders: [{ id: "p1", name: pair("山田", ""), organization: { name: pair("旧", "Old") } }],
    }))
    const theirs = draft((c) => ({
      ...c,
      dataProviders: [{ id: "p1", name: pair("山田太郎", "Taro Yamada"), organization: { name: pair("", "") } }],
    }))

    expect(importFieldPaths(RESEARCH_IMPORT, mine, theirs)).toEqual(["dataProviders.p1.name", "dataProviders.p1.organization.name"])
    expect(initialImport(RESEARCH_IMPORT, mine, theirs).content.dataProviders).toEqual([
      { id: "p1", name: pair("山田太郎", "Taro Yamada"), organization: { name: pair("旧", "Old") } },
    ])
  })

  it("compares the listing's own providers too", () => {
    const mine = draft((c) => c)
    const theirs = draft((c) => ({
      ...c,
      listingSummary: { ...c.listingSummary, dataProviders: [{ id: "l1", name: pair("山田", "Yamada") }] },
    }))

    expect(importFieldPaths(RESEARCH_IMPORT, mine, theirs)).toEqual(["listingSummary.dataProviders"])
  })
})

describe("a publication's datasets in the form", () => {
  const publication = (datasetIds: string[], externalIds: string[]) => ({
    id: "p1",
    title: { state: "value" as const, text: "論文" },
    doi: { state: "value" as const, text: "" },
    datasetIds: { state: "value" as const, ids: datasetIds },
    externalIds,
  })

  it("keeps the typed IDs with the chosen ones, since the two are one place", () => {
    const mine = draft((c) => ({ ...c, relatedPublications: [publication(["d1"], [])] }))
    const theirs = draft((c) => ({ ...c, relatedPublications: [publication([], ["JGAD000001"])] }))

    expect(importFieldPaths(RESEARCH_IMPORT, mine, theirs)).toEqual(["relatedPublications.p1.datasetIds"])
    const written = initialImport(RESEARCH_IMPORT, mine, theirs).content.relatedPublications[0]
    expect(written?.datasetIds).toEqual({ state: "value", ids: [] })
    expect(written?.externalIds).toEqual(["JGAD000001"])
  })

  it("keeps the draft's both lists when the source cites nothing at all", () => {
    const mine = draft((c) => ({ ...c, relatedPublications: [publication(["d1"], ["JGAD000002"])] }))
    const theirs = draft((c) => ({ ...c, relatedPublications: [publication([], [])] }))

    const written = initialImport(RESEARCH_IMPORT, mine, theirs).content.relatedPublications[0]
    expect(written?.datasetIds).toEqual({ state: "value", ids: ["d1"] })
    expect(written?.externalIds).toEqual(["JGAD000002"])
  })
})

describe("the lists the conflict dialog opens holding", () => {
  const provider = (id: string, name: string) => ({
    id,
    name: pair(name, name),
    organization: { name: pair("", "") },
  })
  const withProviders = (...rows: ReturnType<typeof provider>[]) => draft((content) => ({ ...content, dataProviders: rows }))
  const ids = (value: DraftInput) => value.content.dataProviders.map((row) => row.id)
  const merged = (base: DraftInput, mine: DraftInput, theirs: DraftInput) =>
    initialMerge(RESEARCH_IMPORT, base, mine, theirs, diffDraftInput(base, theirs))

  it("keeps a row added on either side, and one this screen changed that was removed elsewhere", () => {
    const base = withProviders(provider("a", "A"), provider("b", "B"), provider("c", "C"))
    const mine = withProviders(provider("a", "A"), provider("b", "B 直した"), provider("c", "C"), provider("m", "M"))
    const theirs = withProviders(provider("a", "A"), provider("t", "T"))

    expect(ids(merged(base, mine, theirs))).toEqual(["a", "b", "m", "t"])
  })

  it("drops a row this screen removed and a row removed elsewhere that this screen left alone", () => {
    const base = withProviders(provider("a", "A"), provider("b", "B"), provider("c", "C"))
    const mine = withProviders(provider("a", "A"), provider("c", "C"))
    const theirs = withProviders(provider("a", "A"), provider("b", "B"))

    expect(ids(merged(base, mine, theirs))).toEqual(["a"])
  })

  it("keeps a row this screen removed when it was changed elsewhere, as it keeps one removed elsewhere that this screen changed", () => {
    const base = withProviders(provider("a", "A"), provider("b", "B"))
    const mine = withProviders(provider("a", "A"))
    const theirs = withProviders(provider("a", "A"), provider("b", "B 直した"))

    expect(ids(merged(base, mine, theirs))).toEqual(["a", "b"])
  })

  it("takes the order saved elsewhere when this screen kept the list as it opened", () => {
    const base = withProviders(provider("a", "A"), provider("b", "B"))
    const theirs = withProviders(provider("b", "B"), provider("a", "A"))

    expect(ids(merged(base, base, theirs))).toEqual(["b", "a"])
  })
})
