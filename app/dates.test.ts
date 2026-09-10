import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { minuteInJst } from "./dates"

/**
 * The same question put to `Intl`, which takes the offset from its own database
 * rather than from a constant. Only the assembling of the digits is done here.
 */
function minuteByIntl(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const at = (type: string) => parts.find((part) => part.type === type)?.value ?? ""
  return `${at("year")}-${at("month")}-${at("day")} ${at("hour")}:${at("minute")}`
}

describe("minuteInJst", () => {
  it("UTC の 15 時ちょうどは、JST の翌日 0 時になる", () => {
    expect(minuteInJst("2026-01-01T15:00:00.000Z")).toBe("2026-01-02 00:00")
  })

  it("その 1 ミリ秒前は、まだ同じ日の 23:59 のまま", () => {
    expect(minuteInJst("2026-01-01T14:59:59.999Z")).toBe("2026-01-01 23:59")
  })

  it("うるう年の 2 月 29 日をまたぐ", () => {
    expect(minuteInJst("2024-02-28T15:00:00.000Z")).toBe("2024-02-29 00:00")
  })

  it("年をまたぐ", () => {
    expect(minuteInJst("2026-12-31T15:00:00.000Z")).toBe("2027-01-01 00:00")
  })

  it("秒は落とし、分は繰り上げない", () => {
    expect(minuteInJst("2026-09-09T07:03:59.999Z")).toBe("2026-09-09 16:03")
  })

  it("どの instant でも、Intl が Asia/Tokyo で読む分と一致する", () => {
    fc.assert(fc.property(
      // 時刻を持たない Date は除く。渡ってくるのは DB の timestamp を書き出した
      // ものだけで、instant でない値はそこに現れない。
      fc.date({
        min: new Date("1970-01-01T00:00:00.000Z"),
        max: new Date("2200-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      }),
      (instant) => {
        expect(minuteInJst(instant.toISOString())).toBe(minuteByIntl(instant))
      },
    ))
  })
})
