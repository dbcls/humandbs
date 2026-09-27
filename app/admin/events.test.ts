import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { eventAction } from "~/db/schema"

import { EVENT_ACTIONS, eventsQuery } from "./events"
import { eventFilterOf } from "./events.server"

describe("操作の記録の一覧", () => {
  it("操作の種類は DB の enum と同じものを、1 つずつ並べる", () => {
    expect([...EVENT_ACTIONS].sort()).toEqual([...eventAction.enumValues].sort())
  })

  it("URL に書いた条件は、読み直すと同じ条件になる", () => {
    const day = fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31"), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10))
    fc.assert(fc.property(
      fc.uniqueArray(fc.constantFrom(...EVENT_ACTIONS)),
      fc.uniqueArray(fc.string({ minLength: 1 })),
      fc.option(day, { nil: null }),
      fc.option(day, { nil: null }),
      (actions, actors, from, to) => {
        const written = eventsQuery({ actions, actors, from, to, size: null, page: 1 })
        expect(eventFilterOf(new URLSearchParams(written))).toEqual({ actions, actors, from, to })
      },
    ))
  })

  it("条件が無ければ URL に何も書かない", () => {
    expect(eventsQuery({ actions: [], actors: [], from: null, to: null, size: null, page: 1 })).toBe("")
  })
})
