import { describe, expect, it } from "vitest"

import { appVersion } from "./version.server"

describe("appVersion", () => {
  it("reads the commit the image was built from", () => {
    expect(appVersion({ HUMANDBS_VERSION: "2a6a2b76" })).toBe("2a6a2b76")
  })

  it("is null where nothing put one in, blank included", () => {
    expect(appVersion({})).toBeNull()
    expect(appVersion({ HUMANDBS_VERSION: "" })).toBeNull()
    expect(appVersion({ HUMANDBS_VERSION: "  " })).toBeNull()
  })
})
