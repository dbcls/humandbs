import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { isShareExpired, isShareOpen, shareExpiryDay, shareExpiryOf } from "./share"

const NOW = new Date("2026-08-10T00:00:00Z")

describe("a share link", () => {
  it("does not open while sharing is off, whatever the expiry has", () => {
    expect(isShareOpen({ enabled: false, expiresAt: null }, NOW)).toBe(false)
    expect(isShareOpen({ enabled: false, expiresAt: new Date("2030-01-01") }, NOW)).toBe(false)
  })

  it("opens with no expiry, which is what a link is given by default", () => {
    expect(isShareOpen({ enabled: true, expiresAt: null }, NOW)).toBe(true)
  })

  it("stops opening the moment the expiry is reached", () => {
    expect(isShareOpen({ enabled: true, expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(true)
    expect(isShareOpen({ enabled: true, expiresAt: NOW }, NOW)).toBe(false)
    expect(isShareOpen({ enabled: true, expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(false)
  })

  /** Two different things to tell an administrator, and two different fixes. */
  it("is expired rather than private when the date has gone by", () => {
    const lapsed = { enabled: true, expiresAt: new Date(NOW.getTime() - 1) }
    expect(isShareExpired(lapsed, NOW)).toBe(true)
    expect(isShareExpired({ enabled: false, expiresAt: null }, NOW)).toBe(false)
    expect(isShareExpired({ enabled: true, expiresAt: null }, NOW)).toBe(false)
  })
})

/**
 * The expiry is typed as a day, and a day is cut in JST. Stored as the end of
 * the UTC day, the link stayed open until nine the next morning.
 */
describe("the expiry a day gives", () => {
  it("closes the link at the end of that day in JST, and not a moment later", () => {
    const expiresAt = shareExpiryOf("2026-10-01")
    if (expiresAt === null) throw new Error("expected a day")
    const policy = { enabled: true, expiresAt }

    expect(isShareOpen(policy, new Date("2026-10-01T23:59:59+09:00"))).toBe(true)
    expect(isShareOpen(policy, new Date("2026-10-02T00:00:00+09:00"))).toBe(false)
    expect(isShareOpen(policy, new Date("2026-10-02T08:59:59+09:00"))).toBe(false)
  })

  it("is read back as the day it was typed", () => {
    const days = fc.date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T00:00:00Z"), noInvalidDate: true })
      .map((at) => at.toISOString().slice(0, 10))
    fc.assert(fc.property(days, (day) => {
      const expiresAt = shareExpiryOf(day)
      expect(expiresAt).not.toBeNull()
      expect(shareExpiryDay(expiresAt ?? new Date(0))).toBe(day)
    }))
  })

  it("reads a stored instant as its JST day, which is the next UTC day's morning", () => {
    expect(shareExpiryDay(new Date("2026-10-01T15:00:00Z"))).toBe("2026-10-02")
    expect(shareExpiryDay(new Date("2026-10-01T14:59:59Z"))).toBe("2026-10-01")
  })

  it("is nothing for what is not a day", () => {
    for (const typed of ["", "2026-02-31", "2026-10-1", "2026-10-01T00:00", "tomorrow"]) {
      expect(shareExpiryOf(typed), typed).toBeNull()
    }
  })
})
