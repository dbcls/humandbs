import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isPreviewPath, previewDatasetPath, previewPath } from "./urls"

describe("isPreviewPath", () => {
  it("takes every address a share link opens", () => {
    fc.assert(fc.property(fc.string(), fc.string(), (token, datasetId) => {
      expect(isPreviewPath(previewPath(token))).toBe(true)
      expect(isPreviewPath(previewDatasetPath(token, datasetId))).toBe(true)
    }))
  })

  it("leaves an address that only begins with the same letters, or holds them further in", () => {
    for (const path of ["/", "/previews", "/preview-guide", "/research/preview", "/admin/preview", ""]) {
      expect(isPreviewPath(path)).toBe(false)
    }
  })
})
