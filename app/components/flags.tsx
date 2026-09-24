import type { ReactNode } from "react"

import { Badge, type Tone } from "~/components/base"
import { Icon, type IconName } from "~/components/icons"

/**
 * The marks a management screen puts on some of its rows, each with the one
 * colour and the one glyph it wears wherever it stands (`docs/ui.md` の
 * 「壊れるもの」).
 *
 * **The colour says what the reader does about it, and there are four
 * answers.** `danger` — it stops something, deal with it first. `warning` — it
 * is short of something, look before going on. `accent` — it moved: this draft
 * changed it, or it is live, or a question on it is open. `brand` — it is the
 * one being pointed at. Everything else is a fact read in passing and stays
 * `muted`, including what passed: a resolved question wears no colour, because
 * a colour is somewhere to look.
 *
 * **The glyph says what it is about**, the way the glyph before a control does,
 * so the same fact carries the same glyph on every screen. Kept here rather than
 * at each use, a mark named on one screen cannot drift from the same mark on
 * the next.
 */
export const FLAG = {
  /** A draft that has written something here, a version being updated. */
  changed: { tone: "accent", icon: "edit" },
  /** Where the draft and the published version say different things. */
  differs: { tone: "accent", icon: "diff" },
  /** A question nobody has answered yet. */
  unresolved: { tone: "accent", icon: "comment" },
  /** Questions, none of them open: the count of a place that could have one. */
  comments: { tone: "muted", icon: "comment" },
  /** Seen by readers now. */
  live: { tone: "accent", icon: "eye" },
  /** Seen by readers once its date comes. */
  scheduled: { tone: "accent", icon: "clock" },
  /** What publishing refuses, or a job that failed. */
  stops: { tone: "danger", icon: "alert" },
  /** A shortcoming: an id not issued, a value unsettled or untranslated, what publishing asks to confirm. */
  short: { tone: "warning", icon: "warning" },
  /** The row being folded into another. */
  merging: { tone: "warning", icon: "merge" },
  /** The one a pointer names: the primary id, the series' current document. */
  pointed: { tone: "brand", icon: "check" },
  /** An id kept beside the primary one. */
  secondary: { tone: "muted", icon: "link" },
  /** Taken off the page by hand, the way it was put on: an alert not shown. */
  off: { tone: "muted", icon: "eye-off" },
  /** Seen by nobody outside: not public, not published. */
  hidden: { tone: "muted", icon: "lock" },
  /** A question that has been answered. */
  resolved: { tone: "muted", icon: "check" },
  /** The notation a field reads what is typed as. */
  notation: { tone: "muted", icon: "type" },
} as const satisfies Record<string, { tone: Tone, icon: IconName }>

export type FlagKind = keyof typeof FLAG

/** One mark, in the colour and with the glyph its kind has everywhere. */
export function Flag({ kind, children }: { kind: FlagKind, children: ReactNode }) {
  const { tone, icon } = FLAG[kind]
  return <Badge tone={tone} icon={<Icon name={icon} aria-hidden="true" />}>{children}</Badge>
}
