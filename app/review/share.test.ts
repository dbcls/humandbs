import { describe, expect, it } from "vitest"

import { isShareExpired, isShareOpen } from "./share"

const NOW = new Date("2026-08-10T00:00:00Z")

describe("a share link", () => {
  it("does not open while sharing is off, whatever the expiry says", () => {
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
