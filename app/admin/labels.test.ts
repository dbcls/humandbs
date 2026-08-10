import { describe, expect, it } from "vitest"

import { proposeDatasetId } from "./labels"

/**
 * The proposal, which is a default and not a rule. What matters is that it does
 * not collide with what the research already holds and that it ignores the ids
 * it has no business counting — everything else about it is free to change.
 */
describe("proposing a dataset id", () => {
  it("starts at one for a research with nothing pinned", () => {
    expect(proposeDatasetId("hum0014", [])).toBe("hum0014-NHA001")
  })

  it("takes the number after the highest it already holds", () => {
    const taken = ["hum0014-NHA001", "hum0014-NHA007", "hum0014-NHA003"]

    expect(proposeDatasetId("hum0014", taken)).toBe("hum0014-NHA008")
  })

  it("counts the highest rather than the number of them, so a gap stays a gap", () => {
    expect(proposeDatasetId("hum0014", ["hum0014-NHA009"])).toBe("hum0014-NHA010")
  })

  it("ignores the ids an archive issued", () => {
    const taken = ["JGAD000123", "DRA000456", "E-GEAD-789", "hum0014.v1.CpG.v1"]

    expect(proposeDatasetId("hum0014", taken)).toBe("hum0014-NHA001")
  })

  it("ignores what another research holds, which is what the hum in it is for", () => {
    expect(proposeDatasetId("hum0014", ["hum0018-NHA004"])).toBe("hum0014-NHA001")
  })

  it("keeps going past three digits rather than wrapping", () => {
    expect(proposeDatasetId("hum0014", ["hum0014-NHA999"])).toBe("hum0014-NHA1000")
  })
})
