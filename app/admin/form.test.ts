import { describe, expect, it } from "vitest"

import { emptyResearchContent, filled } from "~/content/empty"
import type { ResearchContent } from "~/content/types"

import { researchContentInput } from "./form"
import { researchContentOf, saveDraftSchema } from "./form.server"

function contentOf(input: ReturnType<typeof researchContentInput>): ResearchContent {
  const result = researchContentOf(input)
  if (!result.ok) throw new Error(`expected the form to convert: ${JSON.stringify(result.problems)}`)
  return result.content
}

describe("what the editor is handed", () => {
  it("writes prose back out as the markdown that produced it", () => {
    const content: ResearchContent = {
      ...emptyResearchContent(),
      summary: {
        ...emptyResearchContent().summary,
        aims: {
          ja: filled([[{ text: "see " }, { text: "the policy", href: "/nbdc-policy" }]]),
          en: filled([]),
        },
      },
    }

    expect(researchContentInput(content).summary.aims.ja.text)
      .toBe("see [the policy](/nbdc-policy)")
  })

  it("hands a slot that holds no value an empty box to type into", () => {
    const content: ResearchContent = {
      ...emptyResearchContent(),
      title: { ja: { state: "unknown" }, en: { state: "not-applicable" } },
    }

    const input = researchContentInput(content)
    expect(input.title.ja).toEqual({ state: "unknown", text: "" })
    expect(input.title.en).toEqual({ state: "not-applicable", text: "" })
  })
})

describe("what the editor sends back", () => {
  it("drops the half-typed text of a slot whose state says there is no value", () => {
    const input = researchContentInput(emptyResearchContent())
    input.title.ja = { state: "unknown", text: "half written" }
    input.title.en = { state: "not-applicable", text: "also half written" }
    input.summary.aims.ja = { state: "unknown", text: "# a heading nobody will see" }

    const content = contentOf(input)

    expect(content.title.ja).toEqual({ state: "unknown" })
    expect(content.title.en).toEqual({ state: "not-applicable" })
    expect(JSON.stringify(content)).not.toContain("half written")
    expect(JSON.stringify(content)).not.toContain("a heading nobody will see")
  })

  it("refuses prose holding a construct the tree cannot keep, naming the field and language", () => {
    const input = researchContentInput(emptyResearchContent())
    input.summary.methods.en = { state: "value", text: "| a | b |\n| --- | --- |" }

    const result = researchContentOf(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.path)).toEqual(["summary.methods.en"])
    expect(result.problems[0]?.syntax).toBe("table")
  })

  it("reports every field that holds refused markup, not only the first", () => {
    const input = researchContentInput(emptyResearchContent())
    input.summary.aims.ja = { state: "value", text: "# heading" }
    input.releaseNote.en = { state: "value", text: "- item" }

    const result = researchContentOf(input)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems.map((problem) => problem.path))
      .toEqual(["summary.aims.ja", "releaseNote.en"])
  })

  it("does not read a value field as markdown, so punctuation stays punctuation", () => {
    const input = researchContentInput(emptyResearchContent())
    input.title.ja = { state: "value", text: "# not a heading, *not* emphasis" }

    expect(contentOf(input).title.ja).toEqual({
      state: "value",
      value: "# not a heading, *not* emphasis",
    })
  })
})

describe("the payload a save has to be", () => {
  const valid = {
    revision: 1,
    note: "",
    content: researchContentInput(emptyResearchContent()),
  }

  it("accepts what the editor produces", () => {
    expect(saveDraftSchema.safeParse(valid).success).toBe(true)
  })

  it("refuses two elements sharing one identity, which a comment could not address", () => {
    const shared = {
      ...valid,
      content: {
        ...valid.content,
        grants: [
          { ...emptyGrant("same"), grantIds: [] },
          { ...emptyGrant("same"), grantIds: [] },
        ],
      },
    }

    expect(saveDraftSchema.safeParse(shared).success).toBe(false)
  })

  it("refuses a dataset reference that is not an identity", () => {
    expect(saveDraftSchema.safeParse({
      ...valid,
      content: { ...valid.content, datasetIds: ["JGAD000001"] },
    }).success).toBe(false)
  })

  it("refuses a revision that is not a whole number", () => {
    expect(saveDraftSchema.safeParse({ ...valid, revision: 1.5 }).success).toBe(false)
    expect(saveDraftSchema.safeParse({ ...valid, revision: "1" }).success).toBe(false)
  })
})

function emptyGrant(id: string) {
  const empty = { state: "value" as const, text: "" }
  const pair = { ja: empty, en: empty }
  return { id, title: pair, agency: { name: pair }, grantIds: [] as string[] }
}
