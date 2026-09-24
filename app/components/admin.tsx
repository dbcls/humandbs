import { useCallback, useState, type ReactNode } from "react"

import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { ButtonLink, Choice, SectionTabs, Chevron, type ButtonSize } from "./base"
import { Icon, type IconName } from "./icons"

/**
 * The way out of a screen the bar does not open.
 *
 * **Only a screen whose parent is missing from the bar carries one**
 * (`admin/navigation.ts` is what the bar holds): the box and the draft lead to
 * their research, the datasets and the review screen lead to their draft, a
 * dataset leads to the list it is in. A screen the bar already reaches would be
 * saying the same thing twice, and a management area that repeats its own shape
 * at the top of every screen is one where a curator reads the depth instead of
 * the work.
 *
 * **It is drawn as a control, not as a line of text.** It stands beside the
 * other places the screen leads to, and a bare link among outlined buttons
 * reads as a caption rather than as the one way out.
 *
 * `onBand` is for the one standing in a page's opening band (`base.tsx` の
 * `Band`), where the colour the rest of the site draws links in is unreadable
 * against the fill.
 */
export function AdminBack({ to, label, icon, onBand = false }: {
  to: string
  label: string
  /** The mark it carries, which the screen chooses along with the word. */
  icon?: IconName
  onBand?: boolean
}) {
  return (
    <ButtonLink
      to={to}
      variant="secondary"
      onBand={onBand}
      icon={icon === undefined
        ? undefined
        : icon === "chevron-left" || icon === "chevron-right"
          ? <Chevron dir={icon === "chevron-left" ? "left" : "right"} />
          : <Icon name={icon} aria-hidden="true" />}
    >
      {label}
    </ButtonLink>
  )
}

/**
 * What one pane can be told to show.
 *
 * The body is built by the screen: a pane holds a form, or the public page the
 * research is written for, or the row that research takes in the listing, and
 * only the screen knows how to draw any of them.
 */
export interface PaneContent {
  id: string
  label: string
  body: ReactNode
}

/** How the two panes are arranged, which is the reader's and not the screen's. */
interface Arrangement {
  left: string
  right: string
  showing: "both" | "left" | "right"
}

/**
 * Two panes, each showing whatever it is told to.
 *
 * **Every screen opens the same way: both panes, the form on the left, the
 * Japanese page on the right.** Which of the two is showing and what each
 * holds are the person's to change while the screen is open, and neither
 * changes a single value — so the arrangement is not written into the
 * address, the line every other arrangement is held to, and **it is not kept
 * either**: the next screen, and the next visit to this one, open the same
 * way. What was rearranged for one draft is not what the next one wants.
 *
 * **The two are the same width.** What is read here is a form beside the page it
 * writes and neither of them is the subject, so there is no width to prefer; a
 * seam that can be dragged asks for a decision on every visit and leaves
 * whoever opens the screen next with somebody else's answer to it.
 *
 * **Each pane is a box that scrolls inside itself, and the pair is as tall as
 * the window.** Reading one beside the other is the whole point, and a single
 * scroll would carry both away together. **The pair sticks to the top of the
 * window**, so scrolling takes the bar away and leaves two panes filling the
 * screen — which is what somebody writing is looking at most of the time. The
 * height is the window's rather than a number measured on the way past, so
 * nothing has to be told when the bar above wraps onto a second line.
 *
 * The switch is handed back apart from the panes, for a screen whose head
 * carries a tools row (`draft-tools.tsx` の `DraftTools`, `contents.tsx` の
 * `ArticleTools`) to put it on — at that row's far end, beside saving — rather
 * than floating above one of the two things it governs. A screen with no such
 * row keeps it where it always stood, on the showing pane's own tabs.
 */
/**
 * How far from the top of the window the panes stick, and how tall they are.
 *
 * **Under a head that folds to one row, the panes start below that row.** The
 * folded head is one 36px row with 12px above and below (`draft-tools.tsx` の
 * `DraftHead`), so the two are a sum rather than a measurement: the row, then
 * the gap between it and the boxes. Without such a head the panes start at the
 * page's margin.
 */
const PANE_STANCE = {
  page: "top-4 h-[calc(100dvh-2rem)]",
  bar: "top-[calc(3.75rem+1rem)] h-[calc(100dvh-3.75rem-2rem)]",
} as const

export function usePanes({ locale, contents, opens, under = "page" }: {
  locale: Locale
  contents: PaneContent[]
  /** What the right pane opens on; the second content otherwise. */
  opens?: string
  /** What the panes stand under: the page's margin, or a row that stays at the top. */
  under?: keyof typeof PANE_STANCE
}): { view: ReactNode, control: ReactNode, left: string, right: string, showing: Arrangement["showing"] } {
  const words = messagesFor(locale).admin.panes
  const [state, setState] = useState<Arrangement>(() => {
    const first = contents[0]?.id ?? ""
    return {
      left: first,
      right: (opens !== undefined && contents.some((one) => one.id === opens) ? opens : contents[1]?.id) ?? first,
      showing: "both",
    }
  })

  const change = useCallback((next: Partial<Arrangement>) => {
    setState((was) => ({ ...was, ...next }))
  }, [])

  // Left to right, the way the panes themselves stand: a list that starts with
  // "both" asks the reader to find the arrangement they are looking at.
  const shows = [
    { id: "left", label: words.left },
    { id: "both", label: words.both },
    { id: "right", label: words.right },
  ] as const

  // **The word stands beside it, and once.** The group is named for whoever
  // is not looking, and the same word is shown for whoever is — hidden from
  // the reader that already has it as the group's name, so it is not said
  // twice. A step smaller than the save it shares a row with: it arranges the
  // screen and changes nothing, and should not weigh what the save weighs.
  const control = (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-muted text-xs">
      <span aria-hidden="true">{words.showing}</span>
      <Choice
        label={words.showing}
        value={state.showing}
        options={shows}
        onChange={(showing) => { change({ showing }) }}
        pill
        size="xs"
      />
    </span>
  )

  // **A screen whose head carries a tools row draws the switch there instead**
  // (`draft-tools.tsx` の `DraftTools`): that row stays at the top of the
  // window, and the switch belongs beside saving, not floating above one of
  // the two panes it governs. Every other screen keeps it where it always
  // stood — on the panes' own top edge, at the far end of the strip of
  // whichever pane stands last, the right one or the only one.
  const onOwnEdge = under === "page"
  const holdsControl = state.showing === "left" ? "left" : "right"

  function pane(side: "left" | "right") {
    const current = side === "left" ? state.left : state.right
    const shown = contents.find((one) => one.id === current) ?? contents[0]
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded bg-white">
        {/* **The tabs are the top of the box, not a row above it.** What a pane
            holds is part of that pane, and a strip standing on the tint belongs
            to neither of the two boxes it sits between. */}
        <SectionTabs
          label={words.holds}
          scope={side}
          tabs={contents.map((one) => ({ id: one.id, label: one.label }))}
          current={shown?.id ?? ""}
          onSelect={(id) => { change(side === "left" ? { left: id } : { right: id }) }}
          aside={onOwnEdge && side === holdsControl ? control : undefined}
        />
        {/* **The box that scrolls is also what the marks inside it are placed
            against.** Left `static` it is not the containing block of anything
            absolutely positioned within, so those are placed against the page
            instead — and a box only clips what it is the containing block of,
            so the comment marks hanging beside the fields escape the pane and
            stretch the document to the length of the form. */}
        <div data-pane-body className="relative min-h-0 flex-1 overflow-y-auto">{shown?.body}</div>
      </div>
    )
  }

  const view = (
    <div
      // **The window less what the page keeps above and below its content**
      // (`Page` の `py-4`), held that far off the top. At the window's full
      // height the pair reaches both edges: the tabs at the head of each box
      // end up against the browser's own frame, and — because a stuck box is
      // pushed back up by its parent once the page is scrolled to the end —
      // past it by whatever the page keeps under the content.
      className={`sticky flex items-stretch gap-4 ${PANE_STANCE[under]}`}
    >
      {state.showing !== "right" && pane("left")}
      {state.showing !== "left" && pane("right")}
    </div>
  )

  // **Which content stands where, for a screen whose own tools row has more to
  // say about it than the switch alone.** An article's save is one control per
  // open language, so the row above the panes has to know which of them are
  // showing — and Ctrl+S sends the left one specifically — which the switch's
  // own markup does not carry (`contents.tsx` の `ArticleTools`).
  return { view, control, left: state.left, right: state.right, showing: state.showing }
}

/**
 * The way to another screen, standing in a row of controls.
 *
 * **The face of the way out, with the mark after the word** (`AdminBack`
 * turned around): an outlined button with no mark reads as something done
 * here, and a bare link reads as a caption. The mark before the word says
 * what the screen is about; the chevron after
 * it says it is somewhere else, and moves that way when pointed at
 * (`base.tsx` の `Chevron`).
 */
export function WayTo({ to, icon, size, children }: {
  to: string
  /** What the screen is about, before the word. */
  icon?: IconName
  /** `row` inside a table's row, where the row's own operations are that size. */
  size?: ButtonSize
  children: ReactNode
}) {
  return (
    <ButtonLink to={to} size={size} way icon={icon === undefined ? undefined : <Icon name={icon} aria-hidden="true" />}>
      {children}
    </ButtonLink>
  )
}
