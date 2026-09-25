import { describe, expect, it } from "vitest"

import { stepsView } from "./steps.server"

describe("where a draft is shown on its steps", () => {
  it("counts the listing, the threads and the publish check as they are", () => {
    const view = stepsView({
      datasetIds: ["a", "b"],
      shared: true,
      unresolved: 1,
      publishCheck: {
        blocks: [{ kind: "hum-label-missing" }],
        findings: [
          { kind: "unsettled", subject: { kind: "research" }, path: "title", language: "ja" },
          { kind: "unsettled", subject: { kind: "research" }, path: "title", language: "en" },
        ],
      },
    })

    expect(view).toEqual({ datasets: 2, shared: true, unresolved: 1, blocks: 1, findings: 2 })
  })

  it("counts nothing for the publish check when the draft could not be read for it", () => {
    const view = stepsView({ datasetIds: [], shared: false, unresolved: 0, publishCheck: null })

    expect(view).toEqual({ datasets: 0, shared: false, unresolved: 0, blocks: 0, findings: 0 })
  })
})
