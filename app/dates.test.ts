import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  asLocalInput,
  dayFromInput,
  dayInJst,
  minuteInJst,
  minuteOf,
  nowInJst,
  stampFromLocalInput,
  today,
} from "./dates"

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

/** A minute between 2000 and 2100, which is the range a date field is used in. */
const someMinute = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2100-01-01T00:00:00.000Z"),
  noInvalidDate: true,
})

describe("nowInJst", () => {
  it("お知らせの列が持つ形で返る", () => {
    expect(nowInJst()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it("日付の部分は today() と同じ日を指す", () => {
    expect(nowInJst().slice(0, 10)).toBe(today())
  })

  it("時は 24 時制で書く", () => {
    // 12 時制なら午後が 01〜12 に落ちて、そのまま並べると夕方が朝より前に来る。
    // 列の値は文字列のまま比べられるので、ここが 24 時制であることが「公開日時が
    // 過ぎたか」の判定そのものを支えている。
    const hour = Number(nowInJst().slice(11, 13))
    expect(hour).toBeGreaterThanOrEqual(0)
    expect(hour).toBeLessThanOrEqual(23)
  })
})

describe("minuteOf", () => {
  it("秒を落とす", () => {
    expect(minuteOf("2026-06-23 09:30:45")).toBe("2026-06-23 09:30")
  })

  it("秒を落としても、分が違えば前後は入れ替わらない", () => {
    const stamp = (at: Date) => at.toISOString().slice(0, 19).replace("T", " ")
    fc.assert(fc.property(someMinute, someMinute, (a, b) => {
      const [one, other] = [stamp(a), stamp(b)]
      if (one.slice(0, 16) === other.slice(0, 16)) return
      expect(minuteOf(one) < minuteOf(other)).toBe(one < other)
    }))
  })
})

describe("datetime-local の欄との往復", () => {
  it("欄に出して受け取り直すと、元の値に戻る", () => {
    fc.assert(fc.property(someMinute, (at) => {
      const stored = `${at.toISOString().slice(0, 16).replace("T", " ")}:00`
      expect(stampFromLocalInput(asLocalInput(stored))).toBe(stored)
    }))
  })

  it("欄は分までしか持たないので、秒はゼロに落ちる", () => {
    expect(stampFromLocalInput(asLocalInput("2026-06-23 09:30:45"))).toBe("2026-06-23 09:30:00")
  })
})

describe("stampFromLocalInput", () => {
  it("欄が送る形をそのまま受ける", () => {
    expect(stampFromLocalInput("2026-06-23T09:30")).toBe("2026-06-23 09:30:00")
  })

  it("うるう年の 2 月 29 日は受ける", () => {
    expect(stampFromLocalInput("2024-02-29T09:30")).toBe("2024-02-29 09:30:00")
  })

  it("うるう年でない年の 2 月 29 日は受けない", () => {
    // `Date` はこれを 3 月 1 日へ繰り上げるので、形だけ見ていると打った覚えの
    // 無い日付が黙って入る。
    expect(stampFromLocalInput("2026-02-29T09:30")).toBeNull()
  })

  it("暦に無い日は受けない", () => {
    expect(stampFromLocalInput("2026-02-31T09:30")).toBeNull()
    expect(stampFromLocalInput("2026-06-31T09:30")).toBeNull()
    expect(stampFromLocalInput("2026-13-01T09:30")).toBeNull()
  })

  it("時刻の範囲を外れた値は受けない", () => {
    expect(stampFromLocalInput("2026-06-23T24:00")).toBeNull()
    expect(stampFromLocalInput("2026-06-23T09:60")).toBeNull()
  })

  it("日付だけ・秒つき・空・前後の空白は受けない", () => {
    expect(stampFromLocalInput("2026-06-23")).toBeNull()
    expect(stampFromLocalInput("2026-06-23T09:30:00")).toBeNull()
    expect(stampFromLocalInput("")).toBeNull()
    expect(stampFromLocalInput(" 2026-06-23T09:30")).toBeNull()
    expect(stampFromLocalInput("2026-06-23T09:30 ")).toBeNull()
  })

  it("受けた値は、そのまま並べれば時系列になる", () => {
    const asField = (at: Date) => at.toISOString().slice(0, 16)
    fc.assert(fc.property(someMinute, someMinute, (a, b) => {
      const [one, other] = [stampFromLocalInput(asField(a)), stampFromLocalInput(asField(b))]
      if (one === null || other === null) throw new Error("a real minute was refused")
      expect(one < other).toBe(asField(a) < asField(b))
    }))
  })

  it("形が合っていない文字列は、どれも受けない", () => {
    fc.assert(fc.property(fc.string(), (value) => {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return
      expect(stampFromLocalInput(value)).toBeNull()
    }))
  })
})

describe("dayInJst", () => {
  it("UTC の 15 時ちょうどは、JST の翌日になる", () => {
    expect(dayInJst("2026-09-22T15:00:00.000Z")).toBe("2026-09-23")
  })

  it("その 1 ミリ秒前は、まだ同じ日のまま", () => {
    expect(dayInJst("2026-09-22T14:59:59.999Z")).toBe("2026-09-22")
  })

  it("どの instant でも、minuteInJst が読む分の日の部分と一致する", () => {
    fc.assert(fc.property(
      fc.date({
        min: new Date("1970-01-01T00:00:00.000Z"),
        max: new Date("2200-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      }),
      (instant) => {
        expect(dayInJst(instant.toISOString())).toBe(minuteByIntl(instant).slice(0, 10))
      },
    ))
  })
})

describe("dayFromInput", () => {
  it("欄が送る形をそのまま受ける", () => {
    expect(dayFromInput("2026-09-23")).toBe("2026-09-23")
    expect(dayFromInput("2024-02-29")).toBe("2024-02-29")
  })

  it("存在しない日は、形が合っていても日ではない", () => {
    expect(dayFromInput("2026-02-31")).toBeNull()
    expect(dayFromInput("2026-02-29")).toBeNull()
    expect(dayFromInput("2026-13-01")).toBeNull()
    expect(dayFromInput("2026-00-10")).toBeNull()
  })

  it("形の違うものは受けない", () => {
    for (const given of ["", "2026-9-3", "2026-09-23T00:00", "20260923", " 2026-09-23", "2026-09-23 ", "tomorrow"]) {
      expect(dayFromInput(given), given).toBeNull()
    }
  })

  it("Date が持てる日はどれも、そのまま返る", () => {
    fc.assert(fc.property(
      fc.date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2100-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      }),
      (at) => {
        const day = at.toISOString().slice(0, 10)
        expect(dayFromInput(day)).toBe(day)
      },
    ))
  })
})
