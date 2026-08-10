import { describe, expect, it } from "vitest"

import { emptyDatasetContent, emptyResearchContent, filled } from "~/content/empty"
import type { DatasetContent, ResearchContent } from "~/content/types"

import { countFindings, publishGate, type GateDataset, type GateInput } from "./gate"

/**
 * The two kinds of check, and the line between them.
 *
 * The interesting cases are the ones where a check has to decline to fire: an
 * upstream cache that has never been fetched, an accession no upstream is the
 * authority for, and a missing value that is already being counted as something
 * else.
 */

const CACHE_EMPTY = { loaded: false, humLabelOf: new Map<string, string>() }

function gate(over: Partial<GateInput> = {}) {
  return publishGate({
    humLabel: "hum0001",
    content: emptyResearchContent(),
    datasets: [],
    previousDatasetIds: [],
    upstream: CACHE_EMPTY,
    privateFiles: new Set<string>(),
    ...over,
  })
}

function dataset(over: Partial<GateDataset> = {}): GateDataset {
  return {
    datasetId: "d1",
    label: "JGAD000001",
    content: emptyDatasetContent(),
    upstream: null,
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
    expect(gate({ humLabel: null }).blocks).toEqual([{ kind: "hum-label-missing" }])
  })

  it("is a dataset in the version with no dataset id pinned", () => {
    const blocks = gate({
      datasets: [dataset({ datasetId: "a" }), dataset({ datasetId: "b", label: null })],
    }).blocks

    expect(blocks).toEqual([{ kind: "dataset-id-missing", datasetId: "b" }])
  })

  it("is nothing at all once both are pinned", () => {
    expect(gate({ datasets: [dataset()] }).blocks).toEqual([])
  })
})

describe("what is listed and passed", () => {
  it("names every unsettled value, in the research and in its datasets alike", () => {
    const found = gate({
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
    const findings = gate({ content: withTitle(filled("ある"), { state: "unknown" }) }).findings

    expect(countFindings(findings)).toEqual({ unsettled: 1 })
  })

  it("counts a pair with a value on one side and nothing on the other as untranslated only", () => {
    const findings = gate({ content: withTitle(filled("ある"), filled("")) }).findings

    expect(countFindings(findings)).toEqual({ untranslated: 1 })
  })

  it("says nothing about a pair nobody has started", () => {
    expect(gate({ content: withTitle(filled(""), filled("")) }).findings).toEqual([])
  })

  it("names a dataset the version lists and nobody has described", () => {
    const findings = gate({ datasets: [dataset({ content: null })] }).findings

    expect(findings).toEqual([{ kind: "empty-dataset", datasetId: "d1" }])
  })

  it("names a dataset the previous version listed and this one does not", () => {
    const findings = gate({
      datasets: [dataset({ datasetId: "a" })],
      previousDatasetIds: ["a", "gone"],
    }).findings

    expect(findings).toEqual([{ kind: "dropped-dataset", datasetId: "gone" }])
  })

  it("names a dataset another publish changed while this draft held it", () => {
    const findings = gate({
      datasets: [dataset({ upstream: { theirs: ["values.k1", "values.k2"], both: ["releaseDate"] } })],
    }).findings

    expect(findings).toEqual([
      { kind: "upstream-edited", datasetId: "d1", theirs: 2, both: 1 },
    ])
  })

  it("says nothing when the three-way found no difference", () => {
    const findings = gate({ datasets: [dataset({ upstream: { theirs: [], both: [] } })] }).findings

    expect(findings).toEqual([])
  })
})

describe("checking the pins against the application system", () => {
  const loaded = (pairs: [string, string][]) => ({ loaded: true, humLabelOf: new Map(pairs) })

  it("does not run at all while the cache has never been fetched", () => {
    const findings = gate({ datasets: [dataset()], upstream: CACHE_EMPTY }).findings

    expect(findings).toEqual([])
  })

  it("names an accession the application system does not know", () => {
    const findings = gate({
      datasets: [dataset()],
      upstream: loaded([["JGAD000999", "hum0001"]]),
    }).findings

    expect(findings).toEqual([
      { kind: "pin-unknown-upstream", datasetId: "d1", label: "JGAD000001" },
    ])
  })

  it("names an accession the application system gives to another research", () => {
    const findings = gate({
      datasets: [dataset()],
      upstream: loaded([["JGAD000001", "hum0777"]]),
    }).findings

    expect(findings).toEqual([{
      kind: "pin-disagrees-upstream",
      datasetId: "d1",
      label: "JGAD000001",
      upstreamHumLabel: "hum0777",
    }])
  })

  it("says nothing when the two agree", () => {
    const findings = gate({
      datasets: [dataset()],
      upstream: loaded([["JGAD000001", "hum0001"]]),
    }).findings

    expect(findings).toEqual([])
  })

  it("leaves alone the ids no application system issues", () => {
    const findings = gate({
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
    const findings = gate({
      humLabel: null,
      datasets: [dataset()],
      upstream: loaded([["JGAD000001", "hum0777"]]),
    }).findings

    expect(findings).toEqual([])
  })
})

describe("files a dataset selects", () => {
  function selecting(names: string[], datasetId = "d1"): GateDataset {
    return dataset({
      datasetId,
      content: { ...emptyDatasetContent(), fileSelection: names },
    })
  }

  it("lists a selected file that is still in the private bucket", () => {
    const findings = gate({
      datasets: [selecting(["closed.zip"])],
      privateFiles: new Set(["closed.zip"]),
    }).findings

    expect(findings).toEqual([{ kind: "private-file", datasetId: "d1", fileName: "closed.zip" }])
  })

  it("says nothing about a selected file a reader can already fetch", () => {
    const findings = gate({
      datasets: [selecting(["open.zip"])],
      privateFiles: new Set(["closed.zip"]),
    }).findings

    expect(findings).toEqual([])
  })

  it("says nothing about a selection the box does not hold at all", () => {
    // The selection is a note over the listing rather than a claim that the
    // file exists, so a name in neither bucket simply does not draw.
    const findings = gate({
      datasets: [selecting(["gone.zip"])],
      privateFiles: new Set(["closed.zip"]),
    }).findings

    expect(findings).toEqual([])
  })

  it("lists one file once per dataset that selects it, because each is a place to look", () => {
    const findings = gate({
      datasets: [selecting(["closed.zip"], "d1"), selecting(["closed.zip"], "d2")],
      privateFiles: new Set(["closed.zip"]),
    }).findings

    expect(findings.map((finding) => finding.kind)).toEqual(["private-file", "private-file"])
  })

  it("says nothing about a dataset with no description to hold a selection", () => {
    const findings = gate({
      datasets: [dataset({ content: null })],
      privateFiles: new Set(["closed.zip"]),
    }).findings

    expect(findings).toEqual([{ kind: "empty-dataset", datasetId: "d1" }])
  })

  it("never stops the publish over a file", () => {
    const blocks = gate({
      datasets: [selecting(["closed.zip"])],
      privateFiles: new Set(["closed.zip"]),
    }).blocks

    expect(blocks).toEqual([])
  })
})
