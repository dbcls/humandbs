import { describe, expect, it } from "vitest"

import { conditions } from "./search-as-typed"

function form(...given: [string, string][]): FormData {
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

describe("conditions", () => {
  it("値のある欄はそのまま残る", () => {
    expect(pairs(conditions(form(["q", "cancer"], ["sort", "date"]), null)))
      .toEqual([["q", "cancer"], ["sort", "date"]])
  })

  it("空の欄は落ちる", () => {
    expect(pairs(conditions(form(["q", "cancer"], ["rangeFrom", ""]), null)))
      .toEqual([["q", "cancer"]])
  })

  it("両端の空いた範囲は、両方とも落ちる", () => {
    expect(pairs(conditions(form(["rangeKey", "age"], ["rangeFrom", ""], ["rangeTo", ""]), null)))
      .toEqual([["rangeKey", "age"]])
  })

  it("box に指定した欄は、空でも残る", () => {
    expect(pairs(conditions(form(["q", "cancer"], ["k", ""]), "k")))
      .toEqual([["q", "cancer"], ["k", ""]])
  })

  it("box を指定しても、box 以外の空の欄は落ちる", () => {
    expect(pairs(conditions(form(["k", ""], ["sort", ""], ["size", "50"]), "k")))
      .toEqual([["k", ""], ["size", "50"]])
  })

  it("box に指定した名前の欄が無いときは、何も足さない", () => {
    expect(pairs(conditions(form(["q", "cancer"]), "k"))).toEqual([["q", "cancer"]])
  })

  it("同じ名前の欄が複数あるとき、値のあるものは空のものに巻き込まれない", () => {
    expect(pairs(conditions(form(["f", "brain"], ["f", ""], ["f", "liver"]), null)))
      .toEqual([["f", "brain"], ["f", "liver"]])
  })
})
