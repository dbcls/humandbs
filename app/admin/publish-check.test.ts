import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"

import { countFindings, checkPublish, type PublishCheckDataset, type PublishCheckFiles, type PublishCheckInput } from "./publish-check"

/**
 * The two kinds of check, and the line between them.
 *
 * The interesting cases are the ones where a check has to decline to fire: an
 * accession no upstream is the authority for, and a missing value that is
 * already being counted as something else.
 */

const NO_UPSTREAM = new Map<string, string>()
const NO_FILES: PublishCheckFiles = { stored: new Set(), private: new Set(), onResearchPage: new Set() }

function check(over: Partial<PublishCheckInput> = {}) {
  return checkPublish({
    humLabel: "hum0001",
    content: emptyResearchContent(),
    datasets: [],
    upstream: NO_UPSTREAM,
    files: NO_FILES,
    ...over,
  })
}

/**
 * An id the portal issued by default, so that the checks under test are the
 * only ones that fire: an upstream accession with an empty cache is upstream
 * not knowing it, which is a finding of its own.
 */
function dataset(over: Partial<PublishCheckDataset> = {}): PublishCheckDataset {
  return {
    datasetId: "d1",
    label: "hum0001-NHA001",
    content: emptyDatasetContent(),
    ...over,
  }
}

function withTitle(ja: ResearchContent["title"]["ja"], en: ResearchContent["title"]["en"]) {
  return { ...emptyResearchContent(), title: { ja, en } }
}

function withValue(value: DatasetContent["values"][number]): DatasetContent {
  return { ...emptyDatasetContent(), values: [value] }
}

describe("what stops a publish", () => {
  it("is a research with no hum label pinned", () => {
    expect(check({ humLabel: null }).blocks).toEqual([{ kind: "hum-label-missing" }])
  })

  it("is a dataset in the version with no dataset id pinned", () => {
    const blocks = check({
      datasets: [dataset({ datasetId: "a" }), dataset({ datasetId: "b", label: null })],
    }).blocks

    expect(blocks).toEqual([{ kind: "dataset-id-missing", datasetId: "b" }])
  })

  it("is nothing at all once both are pinned", () => {
    expect(check({ datasets: [dataset()] }).blocks).toEqual([])
  })
})

describe("what is listed and passed", () => {
  it("names every unsettled value, in the research and in its datasets alike", () => {
    const found = check({
      content: withTitle({ state: "unknown" }, filled("t")),
      datasets: [dataset({
        content: withValue({ keyId: "k1", value: { kind: "single", value: { state: "unknown" } } }),
      })],
    }).findings.filter((finding) => finding.kind === "unsettled")

    expect(found).toEqual([
      { kind: "unsettled", subject: { kind: "research" }, path: "title", language: "ja" },
      {
        kind: "unsettled",
        subject: { kind: "dataset", datasetId: "d1" },
        path: "values.k1",
        language: null,
      },
    ])
  })

  it("counts a pair with a value on one side and a question on the other as unsettled only", () => {
    const findings = check({ content: withTitle(filled("ある"), { state: "unknown" }) }).findings

    expect(countFindings(findings)).toEqual({ unsettled: 1 })
  })

  it("counts a pair with a value on one side and nothing on the other as untranslated only", () => {
    const findings = check({ content: withTitle(filled("ある"), filled("")) }).findings

    expect(countFindings(findings)).toEqual({ untranslated: 1 })
  })

  it("reports nothing about a pair nobody has started", () => {
    expect(check({ content: withTitle(filled(""), filled("")) }).findings).toEqual([])
  })

  it("names a dataset the version lists and nobody has described", () => {
    const findings = check({ datasets: [dataset({ content: null })] }).findings

    expect(findings).toEqual([{ kind: "empty-dataset", datasetId: "d1" }])
  })
})

describe("checking the pins against the application system", () => {
  const loaded = (pairs: [string, string][]) => new Map(pairs)

  it("names an accession the application system does not know", () => {
    const findings = check({
      datasets: [dataset({ label: "JGAD000001" })],
      upstream: loaded([["JGAD000999", "hum0001"]]),
    }).findings

    expect(findings).toEqual([
      { kind: "pin-unknown-upstream", datasetId: "d1", label: "JGAD000001" },
    ])
  })

  it("names an accession the application system gives to another research", () => {
    const findings = check({
      datasets: [dataset({ label: "JGAD000001" })],
      upstream: loaded([["JGAD000001", "hum0777"]]),
    }).findings

    expect(findings).toEqual([{
      kind: "pin-disagrees-upstream",
      datasetId: "d1",
      label: "JGAD000001",
      upstreamHumLabel: "hum0777",
    }])
  })

  it("reports nothing when the two agree", () => {
    const findings = check({
      datasets: [dataset({ label: "JGAD000001" })],
      upstream: loaded([["JGAD000001", "hum0001"]]),
    }).findings

    expect(findings).toEqual([])
  })

  it("leaves alone the ids no application system issues", () => {
    const findings = check({
      datasets: [
        dataset({ datasetId: "a", label: "hum0001-NHA001" }),
        dataset({ datasetId: "b", label: "DRA000001" }),
        dataset({ datasetId: "c", label: "E-GEAD-123" }),
      ],
      upstream: loaded([["JGAD000001", "hum0001"]]),
    }).findings

    expect(findings).toEqual([])
  })

  it("cannot compare anything for a research with no hum label of its own", () => {
    const findings = check({
      humLabel: null,
      datasets: [dataset({ label: "JGAD000001" })],
      upstream: loaded([["JGAD000001", "hum0777"]]),
    }).findings

    expect(findings).toEqual([])
  })
})

describe("files a dataset selects", () => {
  function selecting(names: string[], datasetId = "d1"): PublishCheckDataset {
    return dataset({
      datasetId,
      content: { ...emptyDatasetContent(), fileSelection: names },
    })
  }

  it("lists a selected file that is still in the private bucket", () => {
    const findings = check({
      datasets: [selecting(["closed.zip"])],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).findings

    expect(findings).toEqual([{ kind: "private-file", datasetId: "d1", fileName: "closed.zip" }])
  })

  it("reports nothing about a selected file a reader can already fetch", () => {
    const findings = check({
      datasets: [selecting(["open.zip"])],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).findings

    expect(findings).toEqual([])
  })

  it("reports nothing about a selection the prefix does not hold at all", () => {
    // The selection is a note over the listing rather than a claim that the
    // file exists, so a name in neither bucket simply does not draw.
    const findings = check({
      datasets: [selecting(["gone.zip"])],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).findings

    expect(findings).toEqual([])
  })

  it("lists one file once per dataset that selects it, because each is a place to look", () => {
    const findings = check({
      datasets: [selecting(["closed.zip"], "d1"), selecting(["closed.zip"], "d2")],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).findings

    expect(findings.map((finding) => finding.kind)).toEqual(["private-file", "private-file"])
  })

  it("reports nothing about a dataset with no description to hold a selection", () => {
    const findings = check({
      datasets: [dataset({ content: null })],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).findings

    expect(findings).toEqual([{ kind: "empty-dataset", datasetId: "d1" }])
  })

  it("never stops the publish over a file", () => {
    const blocks = check({
      datasets: [selecting(["closed.zip"])],
      files: { ...NO_FILES, private: new Set(["closed.zip"]) },
    }).blocks

    expect(blocks).toEqual([])
  })
})

describe("files no page lists", () => {
  function selecting(names: string[], datasetId = "d1"): PublishCheckDataset {
    return dataset({
      datasetId,
      content: { ...emptyDatasetContent(), fileSelection: names },
    })
  }

  function stored(names: string[], over: Partial<PublishCheckFiles> = {}): PublishCheckFiles {
    return { ...NO_FILES, stored: new Set(names), ...over }
  }

  it("lists a file of the prefix that no dataset selects and the research's page does not list", () => {
    const findings = check({ datasets: [selecting(["a.zip"])], files: stored(["a.zip", "b.pdf"]) }).findings

    expect(findings).toEqual([{ kind: "unlisted-file", fileName: "b.pdf" }])
  })

  it("reports nothing about a file the research's page lists, whatever the datasets select", () => {
    const findings = check({
      datasets: [selecting([])],
      files: stored(["README.pdf"], { onResearchPage: new Set(["README.pdf"]) }),
    }).findings

    expect(findings).toEqual([])
  })

  it("counts a selection of any dataset of the version, not only the first", () => {
    const findings = check({
      datasets: [selecting(["a.zip"], "d1"), selecting(["b.zip"], "d2")],
      files: stored(["a.zip", "b.zip"]),
    }).findings

    expect(findings).toEqual([])
  })

  it("lists a private file no page lists as well: publishing it later would not list it either", () => {
    const findings = check({
      datasets: [],
      files: stored(["closed.zip"], { private: new Set(["closed.zip"]) }),
    }).findings

    expect(findings).toEqual([{ kind: "unlisted-file", fileName: "closed.zip" }])
  })

  it("takes a dataset with no description as selecting nothing", () => {
    const findings = check({ datasets: [dataset({ content: null })], files: stored(["a.zip"]) }).findings

    expect(findings).toEqual([
      { kind: "empty-dataset", datasetId: "d1" },
      { kind: "unlisted-file", fileName: "a.zip" },
    ])
  })

  it("never stops the publish over a file no page lists", () => {
    expect(check({ files: stored(["a.zip"]) }).blocks).toEqual([])
  })

  it("lists each stored file once, in name order, exactly when neither a selection nor the page lists it", () => {
    const name = fc.constantFrom("a.zip", "b.zip", "c.pdf", "d.txt", "e.bam")
    fc.assert(fc.property(
      fc.uniqueArray(name),
      fc.array(fc.uniqueArray(name), { maxLength: 3 }),
      fc.uniqueArray(name),
      (names, selections, listed) => {
        const findings = check({
          datasets: selections.map((selection, at) => selecting(selection, `d${String(at)}`)),
          files: stored(names, { onResearchPage: new Set(listed) }),
        }).findings
        const selected = new Set(selections.flat())
        const expected = names.filter((one) => !selected.has(one) && !listed.includes(one)).sort()

        expect(findings.flatMap((finding) => finding.kind === "unlisted-file" ? [finding.fileName] : [])).toEqual(expected)
      },
    ))
  })
})
