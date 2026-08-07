import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { safeRedirectPath } from "./redirect"

const SITE = "https://humandbs.dbcls.jp"

/**
 * The value arrives in a query parameter, so the interesting inputs are the ones
 * that look like a path but are not. The unicode strings are there because the
 * URL parser normalises more than the eye does.
 */
const candidate = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.webPath(),
  fc.webUrl(),
  fc.tuple(
    fc.constantFrom("/", "//", "/\\", "\\/", "///", "/..//", "/a/../..//", "/./", "/%2F"),
    fc.string(),
  ).map(([prefix, rest]) => `${prefix}${rest}`),
)

describe("戻り先の不変条件", () => {
  it("どんな入力でも、返るのはこのサイト内のアドレスだけ", () => {
    fc.assert(fc.property(candidate, (value) => {
      const path = safeRedirectPath(value)
      expect(new URL(path, SITE).origin).toBe(SITE)
    }))
  })

  it("返る値は必ずスラッシュ 1 つで始まる", () => {
    fc.assert(fc.property(candidate, (value) => {
      const path = safeRedirectPath(value)
      expect(path.startsWith("/")).toBe(true)
      expect(path.startsWith("//")).toBe(false)
    }))
  })

  it("空文字は返らない。返るならリンクとして使える", () => {
    fc.assert(fc.property(candidate, (value) => {
      expect(safeRedirectPath(value)).not.toBe("")
    }))
  })

  it("通した値をもう一度通しても変わらない", () => {
    fc.assert(fc.property(candidate, (value) => {
      const once = safeRedirectPath(value)
      expect(safeRedirectPath(once)).toBe(once)
    }))
  })
})
