import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { buildAlerts, type CmsAlert } from "./cms"

/**
 * The instant an alert went up is read from the offset the input writes, so
 * the same moment has to come out whatever zone the dump happened to render it
 * in — reading the digits as if they were local would move the day for every
 * offset but one, and the trail would then say the banner went up on a day it
 * did not.
 */
function standing(createdAt: string): CmsAlert[] {
  return [{
    id: "1",
    enabled: true,
    createdAt,
    translations: [
      { locale: "ja", content: "<p>お知らせ</p>" },
      { locale: "en", content: "<p>notice</p>" },
    ],
  }]
}

/** `instant` written as ISO 8601 in a zone `offsetMinutes` east of UTC. */
function writtenIn(instant: Date, offsetMinutes: number): string {
  const local = new Date(instant.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 23)
  const sign = offsetMinutes < 0 ? "-" : "+"
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, "0")
  const minutes = String(abs % 60).padStart(2, "0")
  return `${local}${sign}${hours}:${minutes}`
}

describe("alert の作られた瞬間", () => {
  it("どの offset で書かれていても、同じ瞬間になる", () => {
    fc.assert(fc.property(
      fc.date({
        min: new Date("1990-01-01T00:00:00Z"),
        max: new Date("2100-01-01T00:00:00Z"),
        noInvalidDate: true,
      }),
      fc.integer({ min: -14 * 60, max: 14 * 60 }),
      (instant, offsetMinutes) => {
        const [alert] = buildAlerts(standing(writtenIn(instant, offsetMinutes)))
        expect(alert?.shownAt?.getTime()).toBe(instant.getTime())
      },
    ))
  })

  it("enabled でないものは、created_at にどんな文字列が書かれていても表示にした日時が無い", () => {
    fc.assert(fc.property(fc.string(), (createdAt) => {
      const [source] = standing(createdAt)
      if (source === undefined) throw new Error("standing() returned nothing")
      expect(buildAlerts([{ ...source, enabled: false }])[0]?.shownAt).toBeNull()
    }))
  })
})
