import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { LOCALES } from "~/i18n/locale"

import { commentRecordArb, pressRecordArb, publishedRowArb } from "./arbitraries/activity"
import { LINES_PER_HEADING, publishRecords, reviewActivities, slackText, type PublishedRow } from "./message"

const ORIGIN = "https://humandbs.example.org"

describe("reviewActivities", () => {
  it("コメントとボタンの件数の合計は、元の行の数と同じ", () => {
    fc.assert(fc.property(fc.array(commentRecordArb), fc.array(pressRecordArb), (comments, presses) => {
      const activities = reviewActivities(comments, presses)
      const sum = (pick: (one: (typeof activities)[number]) => number) => activities.reduce((total, one) => total + pick(one), 0)
      expect(sum((one) => one.comments)).toBe(comments.length)
      expect(sum((one) => one.presses.commented)).toBe(presses.filter((row) => row.kind === "commented").length)
      expect(sum((one) => one.presses.approved)).toBe(presses.filter((row) => row.kind === "approved").length)
    }))
  })

  it("下書きは 1 度ずつ、行に出てきた下書きがすべて並ぶ", () => {
    fc.assert(fc.property(fc.array(commentRecordArb), fc.array(pressRecordArb), (comments, presses) => {
      const drafts = reviewActivities(comments, presses).map((one) => one.draftId)
      expect(new Set(drafts).size).toBe(drafts.length)
      expect(new Set(drafts)).toEqual(new Set([...comments, ...presses].map((row) => row.draftId)))
    }))
  })

  it("書いた人の名前は重ならず、コメントの数より多くならない", () => {
    fc.assert(fc.property(fc.array(commentRecordArb), (comments) => {
      for (const one of reviewActivities(comments, [])) {
        expect(new Set(one.commenters).size).toBe(one.commenters.length)
        expect(one.commenters.length).toBeLessThanOrEqual(one.comments)
      }
    }))
  })
})

/** What makes two records one line: the same operation on the same subject by the same person. */
function subjectKey(row: PublishedRow): string {
  return JSON.stringify([row.action, row.kind, row.subjectId, row.actor])
}

describe("publishRecords", () => {
  it("同じ人の同じ対象への同じ操作は 1 行になり、行の数は違う組の数と同じ", () => {
    fc.assert(fc.property(fc.array(publishedRowArb), (rows) => {
      expect(publishRecords(rows)).toHaveLength(new Set(rows.map((row) => subjectKey(row))).size)
    }))
  })

  it("行の言語は、その組の記録にある言語を重ねずにサイトの順に並べたもの", () => {
    fc.assert(fc.property(fc.array(publishedRowArb), (rows) => {
      const keys = [...new Set(rows.map(subjectKey))]
      const records = publishRecords(rows)
      records.forEach((record, index) => {
        const key = keys[index] ?? ""
        const written = new Set(rows.filter((row) => subjectKey(row) === key).flatMap((row) => row.locale ?? []))
        expect(record.locales).toEqual(LOCALES.filter((locale) => written.has(locale)))
      })
    }))
  })
})

describe("slackText", () => {
  it("何も起きていないときだけ null になる", () => {
    fc.assert(fc.property(fc.array(commentRecordArb), fc.array(pressRecordArb), fc.array(publishedRowArb), (comments, presses, rows) => {
      const reviews = reviewActivities(comments, presses)
      const text = slackText({ reviews, publishes: publishRecords(rows) }, ORIGIN)
      expect(text === null).toBe(reviews.length === 0 && rows.length === 0)
    }))
  })

  it("入力された語がどれほど崩れていても、< はこのサイトへのリンクの始まりにしか現れない", () => {
    fc.assert(fc.property(fc.array(commentRecordArb), fc.array(pressRecordArb), fc.array(publishedRowArb), (comments, presses, rows) => {
      const text = slackText({ reviews: reviewActivities(comments, presses), publishes: publishRecords(rows) }, ORIGIN) ?? ""
      const opens = [...text.matchAll(/</g)].map((match) => match.index)
      for (const at of opens) expect(text.slice(at, at + ORIGIN.length + 2)).toBe(`<${ORIGIN}/`)
      // Every link is closed on its own line, and nothing else closes one.
      for (const line of text.split("\n")) {
        expect([...line.matchAll(/>/g)].length).toBe([...line.matchAll(/</g)].length)
      }
    }))
  })

  it("見出しの下の行は、公開の行の数か上限の小さい方になる", () => {
    fc.assert(fc.property(fc.array(publishedRowArb, { maxLength: LINES_PER_HEADING * 3 }), (rows) => {
      const publishes = publishRecords(rows)
      const text = slackText({ reviews: [], publishes }, ORIGIN)
      if (text === null) return
      const bullets = text.split("\n").filter((line) => line.startsWith("• "))
      expect(bullets.length).toBe(Math.min(publishes.length, LINES_PER_HEADING))
    }))
  })
})
