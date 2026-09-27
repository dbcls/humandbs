import fc from "fast-check"

import { EVENT_SUBJECT_KINDS } from "~/admin/events"
import { LOCALES } from "~/i18n/locale"

import { NOTIFIED_ACTIONS, type CommentRecord, type PressRecord, type PublishedRow } from "../message"

/**
 * Words somebody typed: names, draft names, titles. Slack's markup characters
 * and a channel mention are weighted in, since keeping them out of the markup
 * is what the escaping is for.
 */
export const typedArb = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.constantFrom("<!channel>", "<!here>", "a & b", "<https://example.org|x>", "山田 (anonymous)", ""),
)

/** A few drafts only, so that the rows of one draft meet. */
const draftArb = fc.record({
  draftId: fc.constantFrom("d1", "d2", "d3", "d4"),
  researchId: fc.constantFrom("r1", "r2"),
  humLabel: fc.option(fc.constantFrom("hum0001", "hum0002"), { nil: null }),
  draftName: typedArb,
})

export const commentRecordArb: fc.Arbitrary<CommentRecord> = fc.record({
  draft: draftArb,
  authorName: typedArb,
  signedIn: fc.boolean(),
}).map(({ draft, ...rest }) => ({ ...draft, ...rest }))

export const pressRecordArb: fc.Arbitrary<PressRecord> = fc.record({
  draft: draftArb,
  kind: fc.constantFrom("commented" as const, "approved" as const),
}).map(({ draft, kind }) => ({ ...draft, kind }))

/** A few subjects only, so that the records of one subject meet and are gathered into one line. */
export const publishedRowArb: fc.Arbitrary<PublishedRow> = fc.record({
  action: fc.constantFrom(...NOTIFIED_ACTIONS),
  kind: fc.constantFrom(...EVENT_SUBJECT_KINDS),
  subjectId: fc.constantFrom("s1", "s2", "s3"),
  name: fc.option(typedArb, { nil: null }),
  actor: fc.constantFrom("末竹", "<!here>"),
  locale: fc.option(fc.constantFrom(...LOCALES), { nil: null }),
  path: fc.option(fc.constantFrom("/research/hum0001/v1", "/news/n1", "/about", "/"), { nil: null }),
})
