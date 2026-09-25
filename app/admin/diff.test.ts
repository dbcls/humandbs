import { describe, expect, it } from "vitest"

import { emptyResearchContent } from "~/content/empty"

import { diffDraftInput, importField } from "./diff"
import { researchContentInput, type DraftInput } from "./form"

function draft(): DraftInput {
  return { content: researchContentInput(emptyResearchContent()) }
}

function withProvider(id: string, name: string): DraftInput {
  const value = { state: "value" as const, text: name }
  const empty = { state: "value" as const, text: "" }
  const base = draft()
  return {
    ...base,
    content: {
      ...base.content,
      dataProviders: [{
        id,
        name: { ja: value, en: empty },
        organization: { name: { ja: empty, en: empty } },
      }],
    },
  }
}

describe("diffDraftInput", () => {
  it("reports nothing about a draft compared with itself", () => {
    expect(diffDraftInput(draft(), draft())).toEqual([])
  })

  it("reports a field by the path the editor addresses it with", () => {
    const mine = draft()
    const theirs = draft()
    theirs.content.summary.targets.en = { state: "value", text: "adults" }

    expect(diffDraftInput(mine, theirs)).toEqual(["summary.targets"])
  })

  it("reports the places in the order the editing form orders them — release note after the title, the lists before the listing's row", () => {
    const mine = draft()
    const theirs = withProvider("p1", "松原")
    const text = { state: "value" as const, text: "x" }
    theirs.content.title.ja = text
    theirs.content.releaseNote.ja = text
    theirs.content.summary.aims.ja = text
    theirs.content.listingSummary.methods.ja = text

    expect(diffDraftInput(mine, theirs)).toEqual([
      "title",
      "releaseNote",
      "summary.aims",
      "dataProviders",
      "listingSummary.methods",
    ])
  })

  it("ignores half-typed text left behind by a slot that holds no value", () => {
    const mine = draft()
    const theirs = draft()
    mine.content.title.ja = { state: "unknown", text: "what I was typing" }
    theirs.content.title.ja = { state: "unknown", text: "what they were typing" }

    expect(diffDraftInput(mine, theirs)).toEqual([])
  })

  it("reports a change of state even when the text agrees", () => {
    const mine = draft()
    const theirs = draft()
    theirs.content.title.en = { state: "unknown", text: "" }

    expect(diffDraftInput(mine, theirs)).toEqual(["title"])
  })

  it("reports an element that only one side has as a change to the array itself", () => {
    expect(diffDraftInput(draft(), withProvider("p1", "Tanaka"))).toEqual(["dataProviders"])
  })

  it("reports a field of an element under that element's identity, not its position", () => {
    expect(diffDraftInput(withProvider("p1", "Tanaka"), withProvider("p1", "Suzuki")))
      .toEqual(["dataProviders.p1.name"])
  })

  it("reports reordering as a change to the array and not to any field", () => {
    const mine = draft()
    const theirs = draft()
    mine.content.datasetIds = ["a", "b"]
    theirs.content.datasetIds = ["b", "a"]

    expect(diffDraftInput(mine, theirs)).toEqual(["datasetIds"])
  })
})

describe("importField", () => {
  it("writes one field of theirs over mine and leaves the rest alone", () => {
    const mine = draft()
    mine.content.title.ja = { state: "value", text: "mine" }
    mine.content.releaseNote.ja = { state: "value", text: "my note" }
    const theirs = draft()
    theirs.content.title.ja = { state: "value", text: "theirs" }
    theirs.content.releaseNote.ja = { state: "value", text: "their note" }

    const taken = importField(mine, theirs, "title")

    expect(taken.content.title.ja.text).toBe("theirs")
    expect(taken.content.releaseNote.ja.text).toBe("my note")
  })

  it("takes a field of an element by its identity, whatever position it sits at", () => {
    const mine = withProvider("p1", "Tanaka")
    const theirs = withProvider("p1", "Suzuki")
    theirs.content.dataProviders = [
      ...withProvider("p0", "Sato").content.dataProviders,
      ...theirs.content.dataProviders,
    ]

    const taken = importField(mine, theirs, "dataProviders.p1.name")

    expect(taken.content.dataProviders).toHaveLength(1)
    expect(taken.content.dataProviders[0]?.name.ja.text).toBe("Suzuki")
  })

  it("changes nothing when the path names an element the other side does not have", () => {
    const mine = withProvider("p1", "Tanaka")

    expect(importField(mine, draft(), "dataProviders.p1.name")).toEqual(mine)
  })
})
