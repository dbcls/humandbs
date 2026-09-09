import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { conditions } from "./search-as-typed"

/**
 * A submission carries whatever the pane's fields are called, and the empty
 * ones are the point, so the values lean on `""` rather than being drawn from
 * the whole of the string space.
 */
const submission = fc.array(fc.tuple(
  fc.constantFrom("k", "q", "sort", "order", "size", "rangeKey", "rangeFrom", "rangeTo", "f"),
  fc.oneof({ weight: 2, arbitrary: fc.constant("") }, { weight: 3, arbitrary: fc.string() }),
))

const box = fc.constantFrom(null, "k", "q", "absent")

function form(given: [string, string][]): FormData {
  const fields = new FormData()
  for (const [key, value] of given) fields.append(key, value)
  return fields
}

/** The tests only put text in, so an entry that is not text is a mistake here. */
function pairs(fields: FormData): [string, string][] {
  const out: [string, string][] = []
  for (const [key, value] of fields) {
    if (typeof value !== "string") throw new TypeError(`${key} is not text`)
    out.push([key, value])
  }
  return out
}

describe("絞り込みの送信内容の不変条件", () => {
  it("空のまま残るのは box に指定した欄だけ", () => {
    fc.assert(fc.property(submission, box, (given, named) => {
      for (const [key, value] of pairs(conditions(form(given), named))) {
        if (value === "") expect(key).toBe(named)
      }
    }))
  })

  it("値のある欄は、順序も値も変わらずに全部残る", () => {
    fc.assert(fc.property(submission, box, (given, named) => {
      expect(pairs(conditions(form(given), named)).filter(([, value]) => value !== ""))
        .toEqual(given.filter(([, value]) => value !== ""))
    }))
  })

  it("欄が増えることはない", () => {
    fc.assert(fc.property(submission, box, (given, named) => {
      expect(pairs(conditions(form(given), named)).length).toBeLessThanOrEqual(given.length)
    }))
  })

  it("通した結果をもう一度通しても変わらない", () => {
    fc.assert(fc.property(submission, box, (given, named) => {
      const once = conditions(form(given), named)
      expect(pairs(conditions(once, named))).toEqual(pairs(once))
    }))
  })
})
