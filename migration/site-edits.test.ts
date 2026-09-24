import { describe, expect, it } from "vitest"

import type { CmsDocumentVersion, CmsDump } from "./cms"
import { applySiteEdits, type SiteEdit } from "./site-edits"

const version = (versionNumber: number, locale: string, title: string, content: string, status = "published"): CmsDocumentVersion => ({
  locale, versionNumber, status, title, content, createdAt: null, publishedAt: null,
})

const cms = (versions: CmsDocumentVersion[]): CmsDump => ({
  documents: [{ slug: "guidelines/data-sharing-guidelines", versions }],
  news: [],
  alerts: [],
})

const edit = (over: Partial<SiteEdit>): SiteEdit => ({
  slug: "guidelines/data-sharing-guidelines",
  versionNumber: 4,
  locale: "ja",
  field: "title",
  before: "ver. 3.1",
  after: "ver. 4",
  ...over,
})

describe("applySiteEdits", () => {
  it("replaces the words in the named version and language only", () => {
    const edited = applySiteEdits(cms([
      version(4, "ja", "ガイドライン ver. 3.1", "本文"),
      version(4, "en", "Guidelines ver. 3.1", "body"),
      version(5, "ja", "ガイドライン ver. 3.1", "本文"),
    ]), [edit({})])

    expect(edited.documents[0]?.versions.map((one) => one.title)).toEqual(["ガイドライン ver. 4", "Guidelines ver. 3.1", "ガイドライン ver. 3.1"])
  })

  it("edits both the draft and the published row of one version", () => {
    const edited = applySiteEdits(cms([
      version(4, "ja", "ver. 3.1", "", "draft"),
      version(4, "ja", "ver. 3.1", ""),
    ]), [edit({})])

    expect(edited.documents[0]?.versions.map((one) => one.title)).toEqual(["ver. 4", "ver. 4"])
  })

  it("applies edits in order, so a later one can match what an earlier one wrote", () => {
    const edited = applySiteEdits(cms([version(4, "ja", "t", "Ver. 3.1（暫定版）")]), [
      edit({ field: "content", before: "Ver. 3.1", after: "Ver. 4" }),
      edit({ field: "content", before: "Ver. 4（暫定版）", after: "Ver. 4" }),
    ])

    expect(edited.documents[0]?.versions[0]?.content).toBe("Ver. 4")
  })

  it("stops when an edit finds nothing, naming where it looked", () => {
    expect(() => applySiteEdits(cms([version(4, "ja", "ver. 3.0", "")]), [edit({})]))
      .toThrow(/guidelines\/data-sharing-guidelines v4 ja title/)
  })

  it("leaves content without a body alone", () => {
    const input = cms([version(4, "ja", "ver. 3.1", null as unknown as string)])

    expect(applySiteEdits(input, [edit({})]).documents[0]?.versions[0]?.content).toBeNull()
  })
})
