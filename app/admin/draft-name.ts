import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

/**
 * The name a draft is given as it comes into being: the number after the
 * highest the research has published, as planned — `v3 予定` beside v1 and v2,
 * `v1 予定` for a research with none.
 *
 * **It is a name and not a promise.** The number a draft goes out under is
 * chosen at publishing, and another draft published first takes the one this
 * name counted on. An admin renames it; nothing renames it by itself.
 */
export function plannedDraftName(highest: number | null): string {
  return `v${String((highest ?? 0) + 1)} 予定`
}

/** A name as typed, or null when there is nothing to call the draft by. */
export function draftNameOf(typed: string): string | null {
  const name = typed.trim()
  return name === "" ? null : name
}

/** What a draft is called on the screen, or 名前未入力 when it has no name. */
export function draftNameShown(name: string, locale: Locale): string {
  return name === "" ? messagesFor(locale).admin.detail.unnamedDraft : name
}

/**
 * The identifier beside the name of a draft's screens: the research's, then
 * what the draft is called — `hum0006 / v7 予定` — so that which of a
 * research's drafts is open is read where the research is. An update adds
 * nothing (null): its version's number is shown beside it already.
 */
export function draftAside(identifier: string | undefined, draftName: string | null, locale: Locale): string | undefined {
  if (draftName === null) return identifier
  const name = draftNameShown(draftName, locale)
  return identifier === undefined ? name : `${identifier} / ${name}`
}
