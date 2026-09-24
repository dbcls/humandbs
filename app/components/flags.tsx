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
  /** A draft whose share link opens now. */
  shared: { tone: "accent", icon: "link" },
  /** Seen by readers once its date comes. */
  scheduled: { tone: "accent", icon: "clock" },
  /** What publishing refuses, or a job that failed. */
  stops: { tone: "danger", icon: "alert" },
  /** A shortcoming: an id not issued, a value unsettled or untranslated, what publishing asks to confirm. */
  short: { tone: "warning", icon: "warning" },
  /** A field somebody saved elsewhere after this screen was opened. */
  conflicted: { tone: "warning", icon: "edit" },
  /** The row being folded into another. */
  merging: { tone: "warning", icon: "merge" },
  /** The one a pointer names: the primary id, the series' current document. */
  pointed: { tone: "brand", icon: "pin" },
  /** An id kept beside the primary one. */
  secondary: { tone: "muted", icon: "link" },
  /** Taken off the page by hand, the way it was put on: an alert not shown. */
  off: { tone: "muted", icon: "eye-off" },
  /** Seen by nobody outside: not public, not published, not shared. */
  hidden: { tone: "muted", icon: "lock" },
  /** What is settled: a question answered, a job finished, a fetch that came back, a research already held. */
  resolved: { tone: "muted", icon: "check" },
  /** What has not happened yet and is waiting its turn: a job queued or running, a fetch never made. */
  waiting: { tone: "muted", icon: "clock" },
  /** What the other side does not have: an application's research not on the portal. */
  absent: { tone: "muted", icon: "circle-slash" },
  /** What cannot be told yet: an application with no research id to look it up by. */
  unknown: { tone: "muted", icon: "help-circle" },
  /** The notation a field reads what is typed as. */
  notation: { tone: "muted", icon: "type" },
} as const satisfies Record<string, { tone: Tone, icon: IconName }>

export type FlagKind = keyof typeof FLAG

/** One mark, in the colour and with the glyph its kind has everywhere. */
export function Flag({ kind, children }: { kind: FlagKind, children: ReactNode }) {
  const { tone, icon } = FLAG[kind]
  return <Badge tone={tone} icon={<Icon name={icon} aria-hidden="true" />}>{children}</Badge>
}

/**
 * A kind's glyph on its own, before the word a pane narrows by — the same glyph
 * the rows then carry (`Stated`), so the shape narrowed by is the shape read.
 */
export function KindMark({ kind }: { kind: FlagKind }) {
  return <Icon name={FLAG[kind].icon} aria-hidden="true" className="mr-1 text-ink-muted" />
}

/**
 * A state as a glyph and a word, on a line — the same kinds `Flag` draws, for
 * a state every row carries.
 *
 * **What every row has is not a badge.** A badge is a box, and a box is for
 * what a reader has to pick out — the rows that carry a shortcoming, the one
 * revision the pointer names, the term being folded away. A state that every
 * row carries (published or not, shared or not) drawn in a box gives every row
 * a box, and then nothing is picked out: the rows that need somebody look
 * exactly like the rows that do not. The glyph is what tells the states apart
 * at a glance; the word is what says which it is once the question is known
 * (`docs/ui.md` の「壊れるもの」).
 *
 * **The glyph is the kind's, and the colour is left out.** A state named here
 * wears the glyph the same state wears as a badge on the next screen, so the
 * two cannot drift apart; the colour stays with the badge, whose job is to be
 * picked out.
 *
 * **It takes one line's height and sits at the top of it**, the box a badge
 * stands in (`Badge`). Left on the baseline, an inline-flex box is placed by
 * its first item's baseline, and a glyph has none — the browser takes the
 * bottom edge of the svg, which is 2.4px under the words' baseline. The line
 * box grows by that much to hold it and the pair sits at the top of the taller
 * line: measured, 1.9px above the words in the cells beside it, and every cell
 * of a top-aligned row moved up with it. Top-aligned in a box of its own
 * line's height, it has no baseline to be placed by.
 */
export function Stated({ kind, children }: { kind: FlagKind, children: ReactNode }) {
  return (
    <span className="inline-flex h-[1lh] items-center align-top text-nowrap">
      <Icon name={FLAG[kind].icon} aria-hidden="true" className="mr-1 text-ink-muted" />
      {children}
    </span>
  )
}
