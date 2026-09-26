/**
 * The parts every screen is built from.
 *
 * Nothing here knows about research, drafts or documents — a part takes what to
 * draw and how loud it should be, and the screen supplies the meaning. That is
 * the line between this file and the rest of `app/components/`: `page.tsx` holds
 * the frame a page sits in and the way a content value is drawn, and the
 * screen-shaped files above it hold the arrangements.
 *
 * **The look is brought over from the previous portal, the code is not.** The
 * header bar and the white box under it, the ruled heading over a listing, the
 * outlined pill buttons, the trapezoid pair of tabs — those are what make a
 * reader recognise the site, so they are reproduced. What is *not* brought over
 * is v1's vocabulary: it drew rounded corners twenty ways, held four separate
 * badge implementations, and used its own palette and Tailwind's side by side.
 * There is no v1 to defer to on those, so each is decided once, here.
 */

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router"

import { Icon, Spinner, type IconName } from "~/components/icons"
import { messagesFor } from "~/i18n/messages"
import { usePressed, useSubmitting } from "~/navigating"

/* ---------------------------------------------------------------- rhythm */

/**
 * How far apart two things sit when one is above the other.
 *
 * **There are three distances and a screen may not invent a fourth.** `tight`
 * is a label and the thing it labels, `normal` is two things inside one box,
 * and `block` is one part of a page and the next. The screens used to have
 * their own margins and had accumulated eleven different ones — `mt-1` beside
 * `mt-2` beside `mt-3` for the same relationship on different pages — which is
 * what makes a site look assembled rather than drawn.
 *
 * **A public screen writes no vertical margin at all**, which
 * `app/app.spacing.test.ts` checks.
 */
const STACK_GAP = { tight: "gap-2", normal: "gap-4", block: "gap-8" }

export function Stack({ gap = "normal", as: Tag = "div", at, fill = false, children }: {
  gap?: keyof typeof STACK_GAP
  /** A list of things is a list; anything else is a plain box. */
  as?: "div" | "ul" | "section" | "nav"
  /**
   * Take the room the column this is shown in has left, and no more, where the
   * column is as tall as the window and one thing inside it is to scroll on
   * its own. Every box on the way down from the column to that thing sets it,
   * or the room stops there. **"No more" is the `min-h-0`**: a flex item is
   * otherwise never shorter than what it holds, and the length of the thing
   * that should scroll would become the length of every box above it.
   */
  fill?: boolean
  /**
   * The place in the content this box holds, when it holds one. It goes onto
   * the markup so that something outside the form can tell which place the
   * caret is in by looking upwards from it, rather than every field having to
   * report it on the way in and out.
   */
  at?: string
  children: ReactNode
}) {
  return <Tag data-at={at} className={`flex flex-col ${STACK_GAP[gap]}${fill ? " min-h-0 flex-1" : ""}`}>{children}</Tag>
}

/* ------------------------------------------------------- remarks */

/**
 * The three parts a remark is made of, as class names.
 *
 * **Exported because site content has remarks too.** A blockquote in a document
 * is an aside rather than a quotation, and the markdown pipeline builds this
 * same box for it (`public/markdown.server.ts`). Two boxes assembled from two
 * lists of classes drift apart; this is the one list.
 */
export const REMARK_CLASSES = {
  box: "flex items-center gap-2 rounded border px-4 py-2 text-sm",
  icon: "flex size-6 shrink-0 items-center justify-center",
  body: "min-w-0 flex-1 text-ink",
}

/**
 * A glyph at the head of a line of text.
 *
 * **The box is the height of the line, so nothing has to be nudged.** An icon
 * set beside `text-sm` is shorter than the line it starts, and the three places
 * that drew one had each corrected it by hand and by a different amount
 * (`mt-0.5`, `mt-1`, nothing at all). Putting the drawing in a box the line's
 * own height centres it wherever it is used.
 */
export function LineIcon({ name, className = "" }: { name: IconName, className?: string }) {
  return (
    <span className={REMARK_CLASSES.icon}>
      <Icon name={name} className={`text-base ${className}`} />
    </span>
  )
}

/**
 * A remark with a glyph at its head: the notices above the page, the asides in
 * an article, and what a form shows it did.
 *
 * They differ in colour and in what they are for; the shape is one shape. Every
 * one of them is drawn here, so the padding, the gap, the corner and the way the
 * glyph is aligned cannot drift apart between them.
 *
 * **The glyph sits at the middle of the box rather than at its first line.** A
 * notice runs to two or three lines as often as to one, and an indicator left at the
 * top of a paragraph reads as belonging to the first line of it rather than to
 * the whole; v1 centres it for the same reason. The close button is centred with it.
 */
function Remark({ box, icon, iconClass = "", live = false, action, children }: {
  box: string
  /** `null` for the plainest one, which is set apart by its edge alone. */
  icon: IconName | null
  iconClass?: string
  /** Whether the box appears in answer to something and should be announced. */
  live?: boolean
  /** A control belonging to the box itself, such as the way to close it. */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      role={live ? "status" : undefined}
      className={`${REMARK_CLASSES.box} ${box}`}
    >
      {icon !== null && <LineIcon name={icon} className={iconClass} />}
      <div className={REMARK_CLASSES.body}>{children}</div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ header bars */

/**
 * The coloured bar that identifies what is below it.
 *
 * **A header bar is for a page about one thing that has a name of its own** — this
 * research, this dataset, this draft. A listing or an article gets a `Heading`
 * instead. Keeping the two apart is what makes the header bar mean something: v1 does
 * the same, and a site where every page opens with the same bar conveys nothing
 * with it.
 *
 * `deep` is the subject itself, `brand` the sections and tables under it,
 * `accent` the one call to action a page may have.
 *
 * **The filled round controls take the same three.** A circle in the top bar
 * and the button in the search box are small enough that a flat fill and a
 * gradient are told apart only when they sit beside a header bar — which is exactly
 * where they sit, so they take the header bar's.
 */
export type HeaderBarTone = "brand" | "deep" | "accent"

export const HEADER_BAR_FILL: Record<HeaderBarTone, string> = {
  brand: "bg-linear-to-r from-brand-dark to-brand-light",
  deep: "bg-linear-to-r from-deep to-ink-muted",
  accent: "bg-linear-to-r from-accent to-accent-light",
}

export function HeaderBar({ tone = "brand", className = "", children }: {
  tone?: HeaderBarTone
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-white ${HEADER_BAR_FILL[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Where the indicator sits, and how far the word sits from it.
 *
 * **The gap is forced in one and chosen in the other.** Hung out through the
 * card's padding, the indicator has to leave exactly enough for the words to land
 * back on the content edge — 24px out, 4px of rule, 20px of gap. Standing at
 * the start there is nothing to land on, so the gap is only what binds the indicator
 * to the word: 10px, which is what db-portal gives its own.
 */
const PANE_RULE = {
  edge: "-ml-6 pl-5",
  start: "pl-2.5",
}

/** The three sizes a heading is set at, largest first. */
const HEADING_LOOK = {
  h1: "text-3xl",
  h2: "text-xl",
  bar: "text-lg",
}

/**
 * What a listing or an article opens with: a rule in the brand colour, the
 * title, and — where there is one — how many rows the reader is looking at.
 *
 * The rule is an indicator beside the words rather than a second thing to read: at
 * the weight of a heading's own stroke it reads as part of the letters, so it
 * is kept thinner than they are.
 *
 * **It sits on the edge of the box, not inside it.** A heading opens a `Card`
 * (`page.tsx`), and the rule is pulled out through that card's padding so that
 * the title starts on the same line as everything under it. Left inside, the
 * rule indents the title away from its own text and marks nothing.
 *
 * **What sits beside the title is centred on it, not sat on its baseline.** The
 * aside and the controls are much smaller than the title, so a shared baseline
 * puts their middles below its middle — measured at 5.7px for the aside and
 * 2.8px for the controls, which reads as the title floating above its own row.
 *
 * **The controls stay at the right of the title's row, and the identifier
 * wraps first.** A wrapping row decides by the controls' whole width at once, so
 * a long slug beside the title dropped every button to the start of the next
 * line while there was still room on the first. From `md` the row does not
 * wrap; the identifier breaks over lines instead. Below it, where the row does
 * wrap, the controls keep to the right edge of the line they land on.
 */
export function Heading({ level = "h1", look = level, rule = "edge", title, aside, badge, from, note, children }: {
  level?: "h1" | "h2"
  /**
   * How large it is drawn, when that is not what its level would give.
   *
   * **The one place the two part is the bar an editing screen hangs under**
   * (`draft-tools.tsx`): the name there is the page's h1, but the bar is stuck
   * to the top of the window and shares its row with the way to save — set at
   * the size of a page heading it would take a third of the room a screen has
   * to type in.
   */
  look?: keyof typeof HEADING_LOOK
  /**
   * Where the indicator sits (`PANE_RULE`): hung out through a card's padding, or
   * at the start of the line for a heading that opens no card.
   */
  rule?: keyof typeof PANE_RULE
  title: string
  /**
   * What is shown beside the name, smaller and quieter than it.
   *
   * **Either how much is being looked at, or which thing this is** — the rows a
   * listing found, or the identifier of the research, the article or the
   * announcement the screen is about. The name shows the role and this shows
   * which one, so that the first thing a reader is handed is what the screen is
   * for rather than a number they would have to recognise.
   */
  aside?: string
  /**
   * An indicator beside the identifier: the screen's own state — an updating
   * draft's "v3 を更新中" — or the kind of thing the identifier names, where
   * the listing it comes from has a column for it (an application's 新規 /
   * データ更新). Not part of the name, so it is shown beside `aside` rather than
   * inside `title`.
   */
  badge?: ReactNode
  /**
   * Where what the screen shows comes from, when that is part of which screen
   * this is — the source an import is reading. **A block of its own, apart
   * from the identifier**: set straight after it at the same size, the two
   * read as one long name, and which part is the research is lost.
   */
  from?: string
  /**
   * What the screen is for, in one line under its name.
   *
   * **The distance to it belongs to the heading rather than to the screen.** A
   * screen that puts the line beside the heading as its own element hands it to
   * whatever `Stack` it is shown in, and the same sentence then sits 16px under
   * one heading and 32px under the next.
   */
  note?: string
  children?: ReactNode
}) {
  const Tag = level
  const head = (
    <div className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-2 md:flex-nowrap ${rule === "edge" ? "-ml-6" : ""}`}>
      <div className={`flex min-w-0 items-center gap-3 border-brand border-l-4 ${rule === "edge" ? "pl-5" : "pl-2.5"}`}>
        <Tag className={`shrink-0 font-bold text-brand ${HEADING_LOOK[look]}`}>
          {title}
        </Tag>
        {/* **It is read rather than glanced at.** What is shown here is a number
            or a slug — hum0588, guidelines/data-sharing-guidelines — which a
            reader takes in character by character to know they are on the right
            screen, so it takes the size of body text rather than of an aside. */}
        {aside !== undefined && <span className="min-w-0 text-ink-muted text-base [overflow-wrap:anywhere]">{aside}</span>}
        {badge}
        {from !== undefined && <span className="ml-3 text-ink-muted text-sm">{from}</span>}
      </div>
      {children !== undefined && (
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-3 text-sm">{children}</div>
      )}
    </div>
  )
  if (note === undefined) return head
  return (
    <Stack gap="tight">
      {head}
      <p className="text-ink-muted text-sm">{note}</p>
    </Stack>
  )
}

/**
 * What names a column shown beside the page rather than the page itself —
 * the refinement panel is the one there is.
 *
 * **It is the page heading's style one step down, not a new idiom.** A pane is
 * read at its own scale (its text is a step smaller than the page's), so a
 * heading set only in bold weighs the same as the words under it and stops
 * reading as a heading at all — which is what the panel's was doing. The brand
 * rule and the brand colour are what the site already uses to show "this identifies
 * what follows", and reusing them costs the reader nothing to learn.
 *
 * **The line under it always spans the pane. Where the rule sits is a
 * choice**, and there are two of them (`PANE_RULE`). The line is the pane's;
 * the rule belongs either to the card or to the thing it identifies.
 */
export function PaneHeading({ title, level = "h2", rule = "edge", children }: {
  title: string
  level?: "h2" | "h3"
  /** Where the indicator sits. */
  rule?: keyof typeof PANE_RULE
  /** What belongs on the right of the same line, if anything. */
  children?: ReactNode
}) {
  const Tag = level
  return (
    <div className="flex items-center justify-between gap-x-3 border-line border-b pb-1">
      {/*
        **It is read at the pane's own scale, not a step above it.** A pane is
        250-odd pixels wide and its text is `text-sm`; a heading a size larger
        has the body's leading with it (1.75, a 28px line box for a 16px
        word) and the block ends up half again as tall as it has anything to
        say. What tells it apart from the words under it is the indicator and the
        colour, which is what they are there for — db-portal sets its sidebar
        heading at the body size for the same reason.
      */}
      <Tag className={`border-brand border-l-4 font-bold text-brand text-sm ${PANE_RULE[rule]}`}>
        {title}
      </Tag>
      {children}
    </div>
  )
}

/* ----------------------------------------------------------------- badges */

/**
 * A short label that shows what something is or what state it is in.
 *
 * **An outline and a colour, never a fill.** A filled badge competes with the
 * header bars for the eye, and a listing of forty datasets would be forty blocks of
 * colour. The colour never has the meaning on its own — the words do, and
 * the badge is unreadable to nobody who cannot tell the colours apart. **A large
 * badge is the one exception** (`large`).
 */
export type Tone = "brand" | "accent" | "muted" | "warning" | "danger"

const BADGE_TONE: Record<Tone, string> = {
  brand: "border-brand text-brand",
  accent: "border-accent text-accent",
  muted: "border-line-strong text-ink-muted",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
}

/** The tint a large badge is shown on: a pale shade of its own colour. */
const BADGE_TINT: Record<Tone, string> = {
  brand: "bg-surface-hover",
  accent: "bg-accent-surface",
  muted: "bg-surface-light",
  warning: "bg-warning-surface",
  danger: "bg-danger-surface",
}

export function Badge({
  tone = "muted",
  onHeaderBar = false,
  pill = false,
  dashed = false,
  large = false,
  onClick,
  icon,
  children,
}: {
  tone?: Tone
  /** A badge sitting on a header bar, where white is the badge rather than the page. */
  onHeaderBar?: boolean
  /** Fully rounded, which is the shape v1 gives the ones that lead somewhere. */
  pill?: boolean
  /**
   * A broken edge, for a value that has not been settled yet: what is drawn is
   * the frame a value will go in rather than a value, and the dashes show it
   * without a word.
   */
  dashed?: boolean
  /**
   * What a preview asks its reader to look at — the office's request for a
   * value, a place the published version reads otherwise. **A size larger, on a
   * tint of its colour, with a broken edge**: a page holds a handful of them,
   * and each is what the reader came to the page to find, where the small
   * outline read as one more label among the values. The two share one shape
   * and differ in colour and glyph. Its height is its own rather than a line's.
   */
  large?: boolean
  /**
   * Makes it a button that opens something — the comparison behind "変更あり".
   * Large only: a small badge that could be pressed would read as a label.
   */
  onClick?: () => void
  icon?: ReactNode
  children: ReactNode
}) {
  if (large) {
    const look = `inline-flex items-center gap-1.5 text-nowrap rounded border border-dashed px-2.5 py-0.5 align-middle text-sm leading-5 ${
      BADGE_TONE[tone]
    } ${BADGE_TINT[tone]}`
    return onClick === undefined
      ? (
          <span className={look}>
            {icon}
            {children}
          </span>
        )
      : (
          <button type="button" onClick={onClick} className={`${look} transition-colors hover:bg-white`}>
            {icon}
            {children}
          </button>
        )
  }
  return (
    /*
      **It takes one line's height and sits in the middle of it** — the same box
      the ticks stand in (`form.tsx` の `CHECKBOX_CELL`). A badge is 20px against a line
      of 22.4px, and a cell aligned to its top puts both at the same 6px: the
      shorter one's middle then lands 1.2px higher than the words beside it,
      which reads as a row that did not quite settle rather than as anything a
      reader can point at. **A line's height rather than a number**, because
      what it has to match is the height of whatever it is shown beside.
    */
    <span className="inline-flex h-[1lh] items-center align-top">
      <span
        // **The line inside is the height of the type, not of a line of prose.**
        // A badge holds one short label and never wraps, so the 18px line
        // `text-xs` sets would leave 2px of air above and below the word
        // inside a box that already has padding for it.
        className={`inline-flex items-center gap-1 text-nowrap border px-2 py-0.5 text-xs leading-3.5 ${
          pill ? "rounded-full" : "rounded"
        } ${dashed ? "border-dashed" : ""} ${
          onHeaderBar ? "border-white/70 text-white" : `bg-white ${BADGE_TONE[tone]}`
        }`}
      >
        {icon}
        {children}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------- buttons */

/**
 * The one shape every control shown over a listing takes.
 *
 * **A white fill, a thin coloured edge and a fully rounded end** — copy, the
 * CSV, the ordering, how many rows a page holds, and the page numbers. v1 draws
 * all of them from a single class for the same reason: they sit in one header bar
 * across the top of a table, and a reader scanning it should be able to tell
 * what can be pressed without reading any of them.
 *
 * **Measured, the alternative was three styles and two edges.** The choosers
 * had the grey of an input (`surface-input`), the page numbers a
 * `line` border that comes to 2.09:1 — under the 3:1 the site requires of
 * something you can operate — and the export buttons the brand edge. One class
 * ends all three disagreements at once, and `brand` on white is 8.6:1.
 *
 * **Hover is left to the halves**, since a welded pair lights the half under
 * the pointer rather than the whole of itself.
 */
export const LISTING_CONTROL = "border border-brand bg-white text-brand"

/**
 * What a control looks like, and **what decides it is how much the screen wants
 * it pressed** — never how it would look nicest there.
 *
 * **Two styles, and a third that is a warning rather than a rank.** A reader
 * arriving at any screen should be able to read the row of controls without
 * reading the words: one filled thing is what they came to do, and an outlined
 * thing is a tool — the back link among them, told from the action by
 * standing to its left.
 *
 * | | 見た目 | いつ |
 * |---|---|---|
 * | `primary` | brand の塗り | **その画面で読者に押してほしい 1 つ。画面に 1 つまで** |
 * | `accent` | accent の塗り | **未保存の変更があるときの保存ボタンだけ。**状態で決まるので、いくつ表示されるかは画面ではなく読者の操作で決まる |
 * | `secondary` | 白地に brand の枠線 | ツール・その場の操作・画面の外へのリンク。**既定** |
 * | `danger` | 白地に danger の枠線 | **取り消せないもの** — 公開の取り下げ、削除、draft の破棄 |
 *
 * **枠線の無いボタンは無い。** 素の語は文の続きに読め、hover して初めて枠線が表示される —
 * 押せると分かるのが押したあとになる。「取り消し」も「保存」と同じ枠線で、
 * 違いは並びの左右と色が示す。**`danger` を数で薄めない** — 色が意味を持ち続ける
 * のは滅多に出ないあいだだけになる。
 *
 * **見た目の数を増やさない。** **選べる見た目があると、次に画面を書く人はそこから選ぶ** —
 * 数を少なく保つことが規則を保つ唯一の方法になる。
 *
 * **`accent` が 1 つだけ例外なのは、これが画面の選択肢ではないから。** 見た目を選ぶのは
 * 画面だが、この見た目を使うかどうかは**欄に何が入力されたか**で決まる — 送っていない変更が
 * あるあいだの保存だけ。多くの画面では `Submit` の `saves` がその判定をし、自分で
 * `dirty` を管理している編集画面だけが直に指定する。**それ以外の場所に書かない。**
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "danger"

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-white hover:brightness-90",
  accent: "border-transparent bg-accent text-white hover:brightness-90",
  secondary: "border-brand bg-white text-brand hover:bg-surface-hover",
  danger: "border-danger bg-white text-danger hover:bg-danger/10",
}

/**
 * The same ranking, drawn on one of the page's coloured header bars.
 *
 * **None of the page's colours can be used on a header bar.** `brand` on the header bar's
 * darkest end is 2.60:1 — under the 3:1 the site requires of the boundary of
 * something you can operate — so a button keeping its usual style would lose its
 * edge into the fill. **White is what the header bar leaves free** (15.97:1 there),
 * which is why a badge on a header bar already inverts the same way (`Badge onHeaderBar`).
 *
 * So the ranking survives and the palette turns over: what was filled becomes
 * the white one, and what was outlined keeps only its edge.
 */
const BUTTON_ON_HEADER_BAR: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-white text-brand hover:bg-surface-hover",
  accent: "border-transparent bg-white text-accent hover:bg-surface-hover",
  secondary: "border-white/70 bg-transparent text-white hover:bg-white/15",
  danger: "border-transparent bg-white text-danger hover:bg-surface-hover",
}

const BUTTON_SIZE = {
  /**
   * **In a line of text, beside the thing it acts on** — a table's row, or a
   * value with a way to take it away shown after it.
   *
   * **It is shorter than the line it is shown in.** What is beside it is the
   * subject, and a control the same size as its subject reads as the larger of
   * the two. Left at `sm` it is 36.4px against a 22.4px line, and the row it
   * sits in grows by half again to hold it.
   *
   * **A word keeps no 36px floor** — that belongs to a control which is only a
   * glyph. What a word may not go under is 24px, and this is 24 — **with or
   * without the word**: a glyph alone set the box by its own 13px and came out
   * 19px, and the comment button beside a 24px one sat visibly lower on the line.
   */
  row: "min-h-6 gap-1 px-2 py-0.5 text-xs",
  /** Beside a value in a panel or a row, where the control is not the subject. */
  xs: "gap-1 px-2 py-1 text-xs",
  sm: "gap-1.5 px-3 py-1.5 text-sm",
  md: "gap-2 px-5 py-2",
  lg: "gap-2 px-8 py-4 text-lg",
}

export type ButtonSize = keyof typeof BUTTON_SIZE

function buttonClass(look: Required<Omit<ButtonLook, "icon">>) {
  const { variant, size, listing, onHeaderBar, className } = look
  return [
    "group/link inline-flex items-center justify-center border font-medium no-underline transition-colors",
    listing ? "rounded-full" : "rounded",
    "disabled:opacity-50 disabled:hover:brightness-100",
    onHeaderBar ? BUTTON_ON_HEADER_BAR[variant] : BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className,
  ].join(" ")
}

interface ButtonLook {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * **In the row of controls above a listing**, which is the one place a
   * control is fully rounded (`LISTING_CONTROL`, and `Chooser` beside it).
   *
   * **Where it is placed, not how it should look.** As a taste the round end was
   * asked for in five places that are not a listing — the cart's two, the words
   * offered under the search box, a term in the editor — and the shape stopped
   * indicating anything. **The page numbers stay square inside the same header bar** for a
   * reason of their own (`page.tsx` の `PAGE_CELL`): a digit fills a 36px box so
   * poorly that rounding the ends leaves a chain of rings to count along.
   */
  listing?: boolean
  /**
   * **On one of the page's coloured header bars**, where the usual styles cannot be
   * read (`BUTTON_ON_HEADER_BAR`). Placement again, not rank: what the button is for
   * has not changed, only what is behind it.
   */
  onHeaderBar?: boolean
  icon?: ReactNode
  className?: string
}

/**
 * A sentence drawn over a control while the pointer is on it or it has focus —
 * a closed control's reason (`Button`), an indicator's effect (`fields.tsx` の
 * `StateToggle`). One look, so that a thing shown over a control is read as
 * the control speaking wherever it appears. Kept `hidden` rather than
 * `invisible` and shown by the wrapper's `group-hover/tip` / `group-focus-visible/tip`
 * — **named**, because an unnamed `group-hover` responds to any ancestor marked
 * `group`, and a collapsible around a form full of toggles then shows every one of them
 * while the pointer is anywhere inside it;
 * which edge it hangs from is the wrapper's to show.
 */
export const TOOLTIP = "pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-64 rounded bg-ink px-2 py-1 text-left text-white text-xs shadow-md"

export function Button({
  variant = "secondary",
  size = "sm",
  listing = false,
  onHeaderBar = false,
  type = "submit",
  icon,
  className = "",
  disabled,
  reasonAt = "right",
  children,
  ...rest
}: ButtonLook & {
  /**
   * Whether it can be pressed — and, given a sentence, why it cannot.
   *
   * **A control that cannot be pressed stays on the screen and shows why.**
   * Taken away, it is looked for among the other controls; left pressable, it
   * is pressed only to be refused. The sentence is drawn over the control
   * while the pointer is on it or it has focus, and read out with it.
   *
   * **The reason is drawn, not left to the browser.** A `title` shows late,
   * only to a pointer, and not at all over a disabled button, which raises no
   * pointer events. So the button lets the pointer through to a wrapper, and
   * the wrapper — which can also take focus, since the button cannot — shows
   * the reason over the control while it is pointed at or focused.
   */
  disabled?: boolean | string
  /**
   * Which edge of the control the reason hangs from.
   *
   * **It hangs from the edge nearest the window's.** The tag is up to 256px
   * wide over a control that is not, so it runs out past one side of it — and
   * past the window if that side is the near one. A control at the right end
   * of a row (a row's delete) hangs it from the right; one at the left end of
   * a row (an alert's show) hangs it from the left.
   */
  reasonAt?: "left" | "right"
  children?: ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "disabled">) {
  // The reason a closed control gives, named so the control can point at it.
  const reasonId = useId()
  const shape = buttonClass({ variant, size, listing, onHeaderBar, className })
  if (typeof disabled !== "string") {
    return (
      <button type={type} className={shape} disabled={disabled} {...rest}>
        {icon}
        {children}
      </button>
    )
  }
  return (
    <span
      className="group/tip relative inline-flex cursor-not-allowed"
      tabIndex={0}
      aria-describedby={reasonId}
    >
      <button
        type={type}
        className={`${shape} pointer-events-none`}
        {...rest}
        disabled
        aria-describedby={reasonId}
      >
        {icon}
        {children}
      </button>
      {/* `hidden` rather than `invisible`: a box that is only unseen still has
          a width, and inside a table's scrolling box that width is what put an
          8px sideways scroll on a table that fit. A description read through
          `aria-describedby` is computed from a hidden node all the same. */}
      <span
        id={reasonId}
        role="tooltip"
        className={`${TOOLTIP} group-focus-visible/tip:block group-hover/tip:block ${reasonAt === "left" ? "left-0" : "right-0"}`}
      >
        {disabled}
      </span>
    </span>
  )
}

/**
 * The same shape for something that navigates rather than acts.
 *
 * `external` is for an address no client-side navigation can answer — a file to
 * download, a redirect to the identity provider — where a `<Link>` would request
 * the route for data instead of following it.
 *
 * **A new tab is said twice, and the part shows both.** The glyph is `external`
 * and the part draws it itself, in place of the one a caller would pick: a way
 * that leaves the screen is that before it is anything else, and a caller
 * choosing `eye` for "open the PDF" is how the same leaving came to be shown with three
 * glyphs. The words are the caller's (`newTabLabel`, required by the type),
 * since this layer holds none — the indicator alone shows nothing to anyone not
 * looking at it.
 */
export function ButtonLink(props: Omit<ButtonLook, "icon"> & {
  to: string
  external?: boolean
  /**
   * What the address responds with is saved rather than shown. For an `external`
   * address only: the browser decides what to do with a page of its own.
   */
  download?: boolean
  /**
   * **A link to another screen**: the chevron after the word, moving that way
   * when pointed at (`Chevron`). The glyph before the word, if any, shows what
   * the screen is about; the one after shows it is somewhere else.
   */
  chevron?: boolean
  children: ReactNode
} & (
  | { newTab?: false, newTabLabel?: undefined, icon?: ReactNode }
  | {
    newTab: true
    /** Said for anyone not looking at the indicator. */
    newTabLabel: string
    icon?: undefined
  }
)) {
  const {
    to,
    variant = "secondary",
    size = "sm",
    listing = false,
    onHeaderBar = false,
    external = false,
    download = false,
    chevron = false,
    className = "",
    children,
  } = props
  const shape = buttonClass({ variant, size, listing, onHeaderBar, className })
  // A new tab is announced rather than just opened, and `noreferrer` keeps the
  // address of the page that opened it out of the other site's log.
  if (props.newTab === true) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={shape}>
        <Icon name="external" aria-hidden="true" />
        {children}
        <span className="sr-only">{props.newTabLabel}</span>
      </a>
    )
  }
  const inside = (
    <>
      {props.icon}
      {children}
      {chevron && <Chevron dir="right" />}
    </>
  )
  if (!external) return <Link to={to} className={shape}>{inside}</Link>
  return <a href={to} className={shape} download={download || undefined}>{inside}</a>
}

/**
 * One of the two things the site is for, drawn at the size that shows it.
 *
 * The front page offers exactly two: provide data, or use it. They are the only
 * place a filled block of colour is this large, which is what makes them read as
 * the trigger rather than as two more links (v1 does the same, at the same size).
 *
 * **The glyph is above the words rather than beside them.** Set beside them the
 * pair is as wide as the sentence and the button grows to the width of whatever
 * column it is shown in; stacked, the block is as wide as its longer line and can
 * be held to the size of a thing you press.
 *
 * **Its gradient is its own, not a header bar's.** A header bar has to keep both ends at
 * 4.5:1 for the small white text it has, which leaves a shade's worth of
 * travel; the one large bold word here is held to 3:1, so the gradient can go
 * far enough to be seen (`app.css`).
 */
const CALL_TO_ACTION_FILL: Record<"accent" | "brand", string> = {
  accent: "bg-linear-to-r from-accent to-accent-lighter",
  brand: "bg-linear-to-r from-brand to-brand-lighter",
}

export function BigAction({ to, tone, icon, external = false, newTabLabel, children }: {
  to: string
  tone: "accent" | "brand"
  icon: IconName
  /** Leaves the site — the application system, the submission navigator. */
  external?: boolean
  /** Said for anyone not looking at the indicator. Required wherever `external` is. */
  newTabLabel?: string
  children: ReactNode
}) {
  const shape = `flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg px-6 py-4 text-center font-bold text-lg text-white no-underline visited:text-white hover:brightness-95 ${CALL_TO_ACTION_FILL[tone]}`
  const inside = (
    <>
      <Icon name={icon} className="text-2xl" />
      <span className="flex items-center gap-2">
        {children}
        {external && <Icon name="external" />}
        {external && newTabLabel !== undefined && <span className="sr-only">{newTabLabel}</span>}
      </span>
    </>
  )
  return external
    ? <a href={to} target="_blank" rel="noopener noreferrer" className={shape}>{inside}</a>
    : <Link to={to} className={shape}>{inside}</Link>
}

/**
 * A control that shows a glyph and nothing else.
 *
 * **The name is required**, because the drawing is `aria-hidden` and there is no
 * text under it: without one the control announces as "button" and is
 * unusable by anybody not looking at it.
 */
export function IconButton({ name, label, pressed, fill = false, titled = true, onClick, type = "button", ...rest }: {
  name: IconName
  label: string
  /**
   * For a control that is on or off.
   *
   * **The state is announced, not only coloured** — and the name stays the same
   * whichever way it is, because a control that renamed itself would be read as
   * "remove … , pressed" and say two opposite things at once.
   *
   * **It is a colour, not a fill.** A filled square is the strongest thing in a
   * table made of rules and text — stronger than the header row over it — and a column
   * of them reads as a column of buttons rather than as indicators against rows. Part
   * way in takes the same colour as in: a row holding nineteen of its twenty
   * datasets is not untouched, and the difference between the two is held by
   * `aria-pressed` rather than by a third shade.
   */
  pressed?: boolean | "mixed"
  /**
   * Pressed, it is filled with the brand rather than drawn in the accent.
   *
   * **For a toggle that sets a state away from the default** — a field's
   * 未確定 / 該当なし. There the pressed toggle is a choice made, and a chosen
   * option is filled wherever the site draws one (`Choice`); an indicator in a
   * column of rows is not, and a fill there would be the loudest thing in the
   * table.
   */
  fill?: boolean
  /**
   * Whether the name is also shown to a pointer as a `title`. Off where the
   * control draws its own sentence over itself (`TOOLTIP`), which would
   * otherwise be followed by the browser's.
   */
  titled?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "title">
& React.RefAttributes<HTMLButtonElement>) {
  const on = pressed === true || pressed === "mixed"
  const look = on
    ? fill ? "bg-brand text-white" : "text-accent enabled:hover:bg-surface-hover"
    : "text-ink-muted enabled:hover:bg-surface-hover enabled:hover:text-ink"
  // **A control that cannot be pressed shows it itself**: it dims, keeps the
  // arrow, and does not respond to a pointer. A glyph has no style of its own to
  // dim, so without this every caller wrapped the button in a faded box.
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={titled ? label : undefined}
      aria-pressed={pressed}
      className={`inline-flex size-tap shrink-0 items-center justify-center rounded transition-colors disabled:opacity-50 ${look}`}
      {...rest}
    >
      <Icon name={name} className="text-base" />
    </button>
  )
}

/**
 * Moving one row of a list up or down by one.
 *
 * **The two ends are the same pair on every list** — a row's own indicators, a
 * card's, a table's — and the end a row cannot move past is pressed-out rather
 * than missing, so the pair is shown in the same place on every row.
 *
 * **How a press travels is the caller's**: a list held in the page moves on
 * `onMove`, a list the server holds wraps each button in its own form
 * (`render`), because an `IconButton` spends its `name` on the glyph and two in
 * one form have nothing left to tell the press apart by.
 */
export function ReorderButtons({ at, of, labels, onMove, render }: {
  /** The row's place, from 0. */
  at: number
  /** How many rows the list holds. */
  of: number
  labels: { up: string, down: string }
  onMove?: (by: -1 | 1) => void
  render?: (by: -1 | 1, button: ReactNode) => ReactNode
}) {
  const one = (by: -1 | 1) => {
    const button = (
      <IconButton
        name={by === -1 ? "chevron-up" : "chevron-down"}
        label={by === -1 ? labels.up : labels.down}
        type={render === undefined ? "button" : "submit"}
        disabled={by === -1 ? at === 0 : at === of - 1}
        onClick={onMove === undefined ? undefined : () => { onMove(by) }}
      />
    )
    return <Fragment key={by}>{render === undefined ? button : render(by, button)}</Fragment>
  }
  return (
    <>
      {one(-1)}
      {one(1)}
    </>
  )
}

/**
 * Choosing between a few things, with all of them shown.
 *
 * **What is chosen is not what should be pressed.** A filled option shows how
 * things stand; the filled button elsewhere on the screen shows what the screen
 * is requesting. Drawn as the same thing they cannot both be read — an editor
 * with a switch on every field had dozens of the first, and the one that
 * saves was lost among them.
 *
 * **So the options are welded rather than spaced.** Sharing an edge they read
 * as one control responding to one question, and a fill inside that edge is no
 * longer the fill of a button shown on its own.
 *
 * **The edge is drawn by the options, one pixel of it shared.** Two boxes a
 * pixel apart draw a 2px line between them, so each option after the first is
 * pulled back onto the one before. **The box itself has no edge** — with
 * one, it would take a pixel off the top and bottom of everything inside it,
 * and what can be pressed is the option rather than the box.
 *
 * **The corner is the box's**, and the options are clipped by it: an option
 * rounding itself would be a pixel rounder than the corner it sits in.
 *
 * **The names do not change with what is chosen.** A control that renamed
 * itself would announce as "mark unsettled, pressed" and say two opposite
 * things at once.
 *
 * **Where the alternatives are many, or their words long, they are collapsed away
 * instead** (`Chooser`). Shown, they cost a row of the screen each time.
 *
 * **One answer can be the quiet one** (`quiet`): chosen, it is drawn as chosen
 * but not filled. An editor asks the same three-way question of every box it
 * holds, and nearly every box gives the ordinary answer — filled, that answer
 * would put a brand fill on every field and the one that saves would be lost
 * among them.
 */
export function Choice<T extends string>({ label, value, options, onChange, size = "sm", pill = false, quiet }: {
  /** What the options are responses to, said for anyone not looking at them. */
  label: string
  value: T
  options: readonly { id: T, label: string }[]
  onChange: (next: T) => void
  size?: "xs" | "sm"
  /**
   * Whether the box is rounded the whole way, the way a badge is.
   *
   * **For a choice that is about the screen rather than about what is on it.**
   * An editor's panes are arranged by the reader and no value moves; drawn with
   * the square corners the fields below it have, the control reads as one more
   * thing the form is requesting.
   */
  pill?: boolean
  /** The answer that is drawn as chosen without the fill, being the ordinary one. */
  quiet?: T
}) {
  const style = (id: T): string => {
    if (value !== id) return "bg-white text-brand hover:bg-surface-hover"
    return id === quiet ? "bg-surface text-ink" : "bg-brand text-white"
  }
  return (
    <div
      role="group"
      aria-label={label}
      // `w-fit` because a flex parent blockifies `inline-flex`, and a box that
      // took the row would round a corner the options are nowhere near.
      className={`inline-flex w-fit items-stretch overflow-hidden ${pill ? "rounded-full" : "rounded"}`}
    >
      {options.map((one, at) => (
        <button
          key={one.id}
          type="button"
          aria-pressed={value === one.id}
          onClick={() => { onChange(one.id) }}
          // The ends are rounded on the option rather than clipped by the box:
          // a square corner cut by a round edge leaves the border showing as a
          // bare upright, which is not the shape either of them is drawing.
          className={`border border-brand font-medium transition-colors ${BUTTON_SIZE[size]} ${
            at === 0 ? "" : "-ml-px"
          } ${pill && at === 0 ? "rounded-l-full pl-4" : ""} ${
            pill && at === options.length - 1 ? "rounded-r-full pr-4" : ""
          } ${style(one.id)}`}
        >
          {one.label}
        </button>
      ))}
    </div>
  )
}

/**
 * An indicator shown in a line of text that opens a panel — the comments on a
 * field, the comparison with the published version.
 *
 * **The style of a `row` button, the line's height, and a 36px reach.** What
 * is shown beside it is the heading or the value it acts on, and a box the size
 * of an ordinary control would be larger than what it is about. So the box is
 * drawn at the row's 24px and the reach is widened past it by a
 * pseudo-element rather than by padding — the line it is shown in keeps its own
 * height.
 *
 * **One part, because the two stand side by side.** Drawn apart they each
 * spelled the same style and the same reach by hand, and the pair on one line is
 * where a pixel of difference between them would show.
 */
export function PanelButton({ icon, label, onClick, children }: {
  icon: IconName
  /** The name, where the words shown are not one (a bare count). */
  label?: string
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`${buttonClass({ variant: "secondary", size: "row", listing: false, onHeaderBar: false, className: "" })} relative after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']`}
    >
      <Icon name={icon} aria-hidden="true" />
      {label !== undefined && <span className="sr-only">{label}</span>}
      {children}
    </button>
  )
}

/**
 * The methods a copy can use to get text onto the clipboard, tried in order by `copyText`.
 * Passed in so the order can be checked without a browser.
 */
export interface ClipboardMethods {
  /** The Clipboard API. Absent outside a secure context, such as a page served over plain http. */
  clipboard: { writeText: (text: string) => Promise<void> } | undefined
  /** A selection copied with `execCommand`, true when the browser reports that it copied. */
  copySelection: (text: string) => boolean
  /** The text shown selected in a dialog, for the reader to copy by hand. */
  show: (text: string) => void
}

/**
 * Puts text on the clipboard, and returns whether it got there or had to be
 * shown to the reader instead.
 *
 * **A press always leads somewhere.** The Clipboard API is missing over plain
 * http and can refuse even where it exists, so the older selection copy is
 * tried next, and when that fails too the text is shown for the reader to copy
 * by hand. A copy that failed without a word left the reader pasting whatever
 * was on the clipboard before.
 */
export async function copyText(text: string, methods: ClipboardMethods): Promise<"copied" | "shown"> {
  if (methods.clipboard !== undefined) {
    try {
      await methods.clipboard.writeText(text)
      return "copied"
    } catch {
      // Refused (no permission, the document not focused): the selection copy below.
    }
  }
  let copied: boolean
  try {
    copied = methods.copySelection(text)
  } catch {
    copied = false
  }
  if (copied) return "copied"
  methods.show(text)
  return "shown"
}

/**
 * The selection copy: a hidden textarea holding the text, selected and copied.
 * Focus goes back to where it was, since selecting moves it into the textarea.
 */
function copySelection(text: string): boolean {
  const before = document.activeElement
  const area = document.createElement("textarea")
  area.value = text
  area.readOnly = true
  area.setAttribute("aria-hidden", "true")
  area.style.position = "fixed"
  area.style.top = "0"
  area.style.left = "0"
  area.style.opacity = "0"
  document.body.append(area)
  area.select()
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only copy that works outside a secure context
    return document.execCommand("copy")
  } finally {
    area.remove()
    if (before instanceof HTMLElement) before.focus()
  }
}

/**
 * The way to put something on the clipboard.
 *
 * **Copying leaves nothing on the screen, so the control accounts for it.** On
 * the press the glyph turns to a tick and the name to the word indicating it is
 * done, and after the time a toast stays up (`TOAST_MS`) both go back. This is
 * the one control that renames itself while it acts: what is copied goes
 * somewhere off the screen, and a status set apart from the control is read
 * as a second thing that happened.
 *
 * **It keeps its width.** The two words are shown in one cell, so the control is
 * as wide as the longer of them whichever it shows, and nothing beside it moves
 * when it responds. **The answer is also said**, by a status beside it that is
 * there from the start — a live region that appears holding its message may not
 * be read at all.
 *
 * `text` may be a function for something that has to be fetched or built at
 * the moment of copying (the rows of a search, an address made absolute).
 *
 * **When the text cannot be put on the clipboard, it is shown instead**
 * (`copyText`), selected, with `byHand` above it; the control does not claim it
 * was copied.
 */
export function CopyButton({ text, label, done, byHand, size = "sm", listing = false, title }: {
  text: string | (() => string | Promise<string>)
  label: string
  /** What the control shows while the copy is fresh. */
  done: string
  /** What the reader is asked above the text when it could only be shown to them. */
  byHand: string
  size?: ButtonSize
  listing?: boolean
  /** What is copied, shown to a pointer — where it is not on the screen already. */
  title?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])
  async function copy() {
    const written = typeof text === "string" ? text : await text()
    const outcome = await copyText(written, {
      clipboard: typeof navigator.clipboard === "undefined" ? undefined : navigator.clipboard,
      copySelection,
      show: (shown) => { window.prompt(byHand, shown) },
    })
    if (outcome === "shown") return
    setCopied(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setCopied(false)
    }, TOAST_MS)
  }
  return (
    <>
      <Button
        type="button"
        size={size}
        listing={listing}
        title={title}
        icon={<Icon name={copied ? "check" : "copy"} aria-hidden="true" />}
        onClick={() => { void copy() }}
      >
        <span className="grid">
          <span aria-hidden={copied} className={`col-start-1 row-start-1 ${copied ? "invisible" : ""}`}>{label}</span>
          <span aria-hidden={!copied} className={`col-start-1 row-start-1 ${copied ? "" : "invisible"}`}>{done}</span>
        </span>
      </Button>
      <span role="status" className="sr-only">{copied ? done : ""}</span>
    </>
  )
}

/**
 * How a link out of a truncated block is drawn — whether it leads somewhere
 * (`MoreLink`) or opens the rest in place (`Clamped`).
 *
 * **An arrow rather than a rule under the words.** It is not a link in a
 * sentence but a link out of the block it closes, and it sits where a reader
 * looks for one: at the end of the line that identifies what they are looking at.
 * The words are small and set in the brand's weight, so that it reads as a
 * control on the heading rather than as another entry in the list — which is
 * also what it is at the foot of a truncated cell, where it is a step smaller
 * than the entries above it.
 *
 * It never wraps: the arrow shows the words belong to it, and a line break
 * between them leaves a chevron on a line of its own.
 *
 * **The two share the drawing because they answer the same question.** Written
 * apart, one cell of a listing said it in the brand's twelve with an arrow and
 * the cell four columns along said it in grey fourteen with nothing, and the
 * reader had no way to know that only one of them could be pressed.
 */
const MORE = "group/link inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-brand text-xs"

/**
 * The way to lift conditions, at either of the two ranges it comes in — all of
 * them, or the ones one facet holds.
 *
 * **One string, because the two are one operation over two scopes.** Written
 * apart they drifted into different sizes and weights, and the wider of the
 * two ended up the lighter — which reads as the narrower being the stronger
 * thing to press. The size is spelled out rather than inherited so that where
 * each sits cannot change what it looks like.
 *
 * **It is not `MORE` with the arrow taken off.** The two spell the same three
 * utilities today, but they answer to different things: `MORE` is a way onward
 * and its other half is what holds the chevron beside the word, while this is a
 * way to undo and holds nothing. Merging one into the other would show the two
 * must always be set alike, which nobody has decided — and there is no third
 * place in the public screens spelling either of them out by hand, so the pair
 * is not a duplication anybody has to keep in step.
 */
export const CLEAR = "font-semibold text-brand text-xs"

/**
 * What names a group inside a pane — the conditions in force, and each box of
 * dimensions the panel offers.
 *
 * **A step below `PaneHeading`, which identifies the pane itself.** That one is the
 * pane's title and has the bar; these sit inside it and are only telling
 * the reader which of several lists they are looking down, so they take the
 * muted ink and the weight and nothing else.
 *
 * **One string, because the two were the same drawing written twice.** They
 * had the same colour, size and weight, and differed only by a `uppercase`
 * that does nothing to Japanese and three tenths of a pixel of tracking — a
 * difference nobody chose, visible in one language only, and the kind that
 * grows a third spelling the next time a group is added.
 */
export const PANE_LABEL = "font-semibold text-ink-muted text-xs"

/**
 * The way from a few of something to all of it — the five newest announcements
 * to the whole listing, a table's first page to the search behind it, one
 * listing to the same search over the other.
 */
export function MoreLink({ to, children }: { to: string, children: ReactNode }) {
  return (
    <Link to={to} className={MORE}>
      {children}
      <Chevron dir="right" />
    </Link>
  )
}

/**
 * The indicator of a way somewhere — before the word for "to there", after it for
 * "onward" — that moves the way it points while the control it is shown in is
 * pointed at or focused.
 *
 * **The motion is what tells a link from an action.** A back link and a trigger are shown with
 * the style every other control is shown with, so the chevron alone shows "elsewhere";
 * one that responds to the pointer shows it
 * again, in the one place the reader is already looking. **Half a step, and
 * only for those who allow motion.** A chevron that turns to open and close
 * something in place is not this: it is drawn as an `Icon` where it turns.
 *
 * The control is the group: every `Button` and `ButtonLink` is one
 * (`buttonClass`), as is `MoreLink`; a bare link adds `group/link` by hand. The
 * group is named so that a chevron inside a collapsed box does not move when the
 * box's own summary is hovered.
 */
export function Chevron({ dir }: { dir: "left" | "right" }) {
  const move = dir === "left"
    ? "group-hover/link:-translate-x-0.5 group-focus-visible/link:-translate-x-0.5"
    : "group-hover/link:translate-x-0.5 group-focus-visible/link:translate-x-0.5"
  return (
    <Icon
      name={dir === "left" ? "chevron-left" : "chevron-right"}
      aria-hidden="true"
      className={`motion-safe:transition-transform ${move}`}
    />
  )
}

/**
 * A condition in force, and the way to lift it.
 *
 * The whole chip is the link that removes it, so what is on the screen and what
 * can be undone are the same object.
 *
 * **What the condition is about and what it shows are two segments.** Run
 * together as one string they read as a single long name, and a column of them
 * gives the eye nothing to line up on; split, the field names form a column and
 * the reader can see at a glance which dimensions are in force. The field is
 * the part that repeats, so it takes the tinted half.
 *
 * **It wraps rather than truncates.** These are shown in a pane a quarter the width
 * of the page, and a condition cut off mid-value is a filter the reader cannot
 * read — which is the one thing a chip exists to prevent.
 */
export function Chip({ field, value, to, remove }: {
  /** The dimension the condition is about. Absent when it identifies none. */
  field?: string
  value: ReactNode
  to: string
  remove: string
}) {
  return (
    <Link
      to={to}
      // Lifting a condition leaves the reader where they were: what they are
      // watching is the listing this chip is shown over, and it is still there
      // afterwards with more in it.
      preventScrollReset
      className="flex items-stretch overflow-hidden rounded border border-line-strong bg-white text-ink text-xs no-underline hover:bg-surface-hover"
    >
      {field !== undefined && (
        <span className="shrink-0 border-line-strong border-r bg-surface px-2 py-1 font-semibold text-ink-muted">
          {field}
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1">
        <span className="min-w-0 break-words">{value}</span>
        <Icon name="close" aria-hidden="true" className="ml-auto shrink-0 text-ink-muted" />
      </span>
      <span className="sr-only">{remove}</span>
    </Link>
  )
}

/**
 * A value that has been picked, and the way to put it back.
 *
 * **The style of a badge** (`Badge`, muted) — it is a value shown in a field
 * rather than something to press — **with the glyph that takes it out at its
 * end**. The whole chip is the button, so the reach is the chip's rather than a
 * 12px glyph's, and the name it announces is the caller's sentence indicating what
 * pressing it does, not the value alone.
 *
 * **The glyph is `close`, not `trash`**: what goes is the value from this
 * field, and the value itself is still there to pick again.
 */
export function ValueChip({ remove, disabled = false, onRemove, children }: {
  /** What pressing it does, said for anyone not looking at the glyph. */
  remove: string
  disabled?: boolean
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded border border-line-strong bg-white px-2 py-0.5 text-ink-muted text-xs leading-3.5 transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
    >
      {children}
      <Icon name="close" aria-hidden="true" />
      <span className="sr-only">{remove}</span>
    </button>
  )
}

/**
 * How many of something a control stands for — the datasets in the cart, the
 * conditions a collapsed pane holds.
 *
 * **A filled disc of the white-text colours**, so it reads as a number riding
 * on the control rather than as a second control. `floating` hangs it off the
 * control's corner, where the control is a 36px circle with no room inside it;
 * **whatever holds a floating one has to be `relative`** and has to show the
 * number in its own name as well — a label replaces what is inside a control,
 * and a number left in the markup alone is read by nobody who cannot see it.
 */
export function CountBubble({ count, tone = "accent", floating = false }: {
  count: number
  tone?: "accent" | "brand"
  floating?: boolean
}) {
  if (count <= 0) return null
  return (
    <span
      // **Keyed by the number**, so a new one is mounted whenever it changes and
      // the animation runs again. Without that the bubble counts up in silence,
      // a thousand pixels from wherever the press was.
      key={count}
      aria-hidden="true"
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1 font-semibold text-white text-xs motion-safe:animate-bump ${
        tone === "accent" ? "bg-accent" : "bg-brand"
      } ${floating ? "-top-1 -right-1 absolute" : ""}`}
    >
      {count}
    </span>
  )
}

/* ---------------------------------------------------------- announcements */

/**
 * A notice the site is showing every reader, and the way to put it away.
 *
 * Amber on cream behind a warning glyph, which is what v1 draws and what these
 * are written for — a maintenance window, a delay in processing applications.
 * **Closing one lasts as long as the page is open** and no longer: an
 * announcement dismissed for good could be missed by somebody who never read
 * it, and the notices are few and short-lived enough that the reader who closes
 * one is not asked again on their way through the site.
 */
export function Announcement({ dismiss, onDismiss, children }: {
  dismiss: string
  /** Absent until the page is running in a browser, where closing is possible. */
  onDismiss?: () => void
  children: ReactNode
}) {
  return (
    <Remark
      box="border-warning bg-warning-surface"
      icon="warning"
      iconClass="text-warning"
      action={onDismiss === undefined
        ? undefined
        : <IconButton name="close" label={dismiss} onClick={onDismiss} />}
    >
      {children}
    </Remark>
  )
}

/* --------------------------------------------------------- header controls */

/**
 * The languages, as the row of round pills v1 puts at the top right.
 *
 * Both are always drawn, and the one being read is filled rather than removed:
 * the pair is what tells a reader the site has another language at all, and a
 * lone "English" implies nothing about which one they are in now.
 */
export function LanguagePills({ label, options }: {
  label: string
  options: { code: string, label: string, to: string, current: boolean }[]
}) {
  return (
    // One track holding both, the way v1 draws it: the pair is a switch with a
    // position, and two loose circles read as two separate controls.
    <nav aria-label={label} className="flex items-center gap-1 rounded-full bg-surface p-1">
      {options.map((option) => (
        option.current
          ? (
              <span
                key={option.code}
                aria-current="true"
                className={`inline-flex size-7 items-center justify-center rounded-full font-semibold text-white text-xs ${HEADER_BAR_FILL.brand}`}
              >
                {option.label}
              </span>
            )
          : (
              <Link
                key={option.code}
                to={option.to}
                hrefLang={option.code}
                lang={option.code}
                className="inline-flex size-7 items-center justify-center rounded-full font-semibold text-ink-muted text-xs no-underline hover:text-ink"
              >
                {option.label}
              </Link>
            )
      ))}
    </nav>
  )
}

/**
 * A round control in the top bar: one glyph, a name it announces itself by, and
 * — where it stands for a collection — how many things are in it.
 *
 * `filled` is for the one that starts something rather than showing something,
 * which in the header is signing in.
 */
export function RoundLink({ to, name, label, filled = false, external = false }: {
  to: string
  name: IconName
  label: string
  filled?: boolean
  /** For an address no client-side navigation can answer, such as `/auth/login`. */
  external?: boolean
}) {
  const className = `inline-flex size-tap items-center justify-center rounded-full border no-underline ${
    filled
      ? `border-transparent text-white hover:brightness-90 ${HEADER_BAR_FILL.brand}`
      : "border-line text-ink-muted hover:bg-surface-hover hover:text-ink"
  }`
  const inside = <Icon name={name} className="text-base" />
  return external
    ? <a href={to} aria-label={label} title={label} className={className}>{inside}</a>
    : <Link to={to} aria-label={label} title={label} className={className}>{inside}</Link>
}

/* ------------------------------------------------------------- breadcrumb */

/**
 * Where the page sits, from the front page down.
 *
 * The last entry is the page itself and is not a link — it identifies where the
 * reader already is, and a link to here would be a way to lose your place.
 */
export function Breadcrumb({ label, trail, current }: {
  /** What the navigation is called, for a reader who cannot see the shape. */
  label: string
  trail: { label: string, to: string }[]
  current: string
}) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {trail.map((step, index) => (
          <li key={step.to} className="flex items-center gap-1">
            <Link to={step.to}>
              {index === 0 && <Icon name="home" className="mr-1" />}
              {step.label}
            </Link>
            <span aria-hidden="true" className="text-ink-muted">/</span>
          </li>
        ))}
        <li aria-current="page" className="text-ink-muted">{current}</li>
      </ol>
    </nav>
  )
}

/* ------------------------------------------------------------------- tabs */

/**
 * The pair of tabs over a listing, which choose what is being listed.
 *
 * Links, not a control: each tab is the address of the other listing with
 * the same search, so the choice is shareable and the browser's own history
 * holds it. The trapezoid is v1's, drawn with a skewed leading edge rather than
 * a background image, and sits at the top right of the box it belongs to.
 *
 * **The strip ends where the box ends.** A tab is the top edge of the box it
 * opens, so a gap on the right leaves it floating over the page instead — the
 * one thing that stops the pair reading as a folder.
 *
 * **A tab that is not the current one sits lower and is lit from inside**, and
 * the one that is stays a step above it and casts a shade upwards. Depth is
 * what the shape is for: two flat trapezoids side by side say which is filled
 * white but not which is in front, and the sloped edge then reads as a stray
 * corner. The tabs overlap for the same reason — the slope has to run *behind*
 * its neighbour to be an edge rather than a gap.
 *
 * **Nothing is outlined.** A surface is told from the one behind it by what it is
 * filled with, which means the tab that is not being read must not be filled
 * with the page's own tint: with an edge drawn round it that looks like a tab,
 * and without one it is a hole. `surface-light` is that surface — above the page,
 * below the white box.
 *
 * **The corners are the large ones because of that.** Three surfaces within a few
 * per cent of each other in lightness (1.05:1 between the tabs, 1.03:1 between
 * the back tab and the page) draw a 4px arc across one or two pixels, and what
 * is left reads as a square corner — a line an outline would have drawn
 * crisply at any radius. Taking the edge away is what makes the radius have to
 * be big enough to be a shape rather than a hint.
 *
 * The one in front is the height of every other thing that can be pressed, and
 * the other is a pixel under it — enough to step down by, and no more.
 */
export function SwitchTabs({ label, tabs }: {
  label: string
  tabs: { label: string, to: string, current: boolean }[]
}) {
  return (
    <nav aria-label={label} className="flex items-end justify-end">
      {tabs.map((tab, at) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.current ? "page" : undefined}
          className={[
            "relative flex items-center rounded-tr-lg px-6 font-bold text-sm no-underline",
            // Room for the leading edge of the first one; after that the boxes
            // meet and the strip is what laps over the tab before it.
            at === 0 ? "ml-6" : "ml-0",
            // The leading edge: a skewed strip shown to the left of the tab,
            // which makes the left side a slope and the right side upright.
            //
            // **Its width is what the shear costs, and then some.** Sheared
            // about its own bottom-right corner, the strip's top edge moves
            // right by tan(25°) × the tab's height — 16.8px at 36px tall. A
            // strip narrower than that never reaches the tab's own left edge up
            // there, and what draws the top of the slope is then the box's
            // square corner standing proud of it.
            //
            // **And the overhang has to clear the corner as well.** A rounded
            // corner starts its arc a radius away from the corner itself, so an
            // overhang shorter than the radius puts the top of the arc to the
            // right of the box's own left edge, and the box's square corner is
            // what draws the first pixels. 24px leaves 7.2px of overhang for a
            // 4px corner. The overhang is also what closes the seam against the
            // tab behind: the two boxes meet, and the strip laps over the join
            // at every height.
            //
            // The corner here is the small one while the upright side takes the
            // large one: this corner is where the slope meets the top at 65°,
            // and an arc run into an acute corner reaches further along both
            // edges than the same arc in a square one.
            "before:absolute before:inset-y-0 before:-left-6 before:w-6",
            "before:origin-bottom-right before:-skew-x-[25deg] before:rounded-tl before:content-['']",
            // **Only the one in front reaches into the box below it.** The two
            // meet at a fractional position, where a shared edge can rasterise
            // as a hairline of the page between them; a pixel of overlap seals
            // it, and white over white cannot be seen. The other must not do
            // the same — a tab is drawn over the box whatever the document
            // order shows (it is the only one of the two that is positioned), so
            // the pixel it lends is its own fill and the darkest part of its
            // inner shade, laid across the top of the card.
            tab.current
              ? "-mb-px z-10 h-tap bg-white text-brand shadow-[0_-2px_3px_rgba(0,0,0,0.02)] before:bg-white"
              : "z-0 h-[calc(var(--spacing-tap)-1px)] bg-surface-light text-ink-muted shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)] hover:bg-surface-hover before:bg-surface-light before:shadow-[inset_0_-3px_5px_-1px_rgba(0,0,0,0.06)] hover:before:bg-surface-hover",
          ].join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

/**
 * The tabs a long form is split into.
 *
 * **Only the display is switched: every field stays in the document**, so one
 * save sends the whole form and nothing an editor typed can be lost by moving
 * between tabs. That is also why a tab has to be able to show an indicator — an
 * unsaved change, a difference from the published version, an unread comment,
 * a problem the save reported — since the reader cannot see the section it is
 * in.
 *
 * **The tab strip is one stop for the keyboard, and the arrows move within it.**
 * One `<button>` per section would put seven stops between the reader and the
 * fields; this is the pattern WAI-ARIA describes for tabs, and the reason it
 * exists.
 *
 * A form under these tabs must not use the browser's own validation: a required
 * field inside a hidden panel cannot be focused, so submitting does nothing at
 * all and implies nothing about why. Validate on the server, which is where the
 * rules are.
 */
/**
 * What a tab and its panel are named.
 *
 * **A strip can be told to name its own**, because a screen may have two of
 * them offering the same choices. Without it both write the same id, and
 * `aria-controls` then leads from one strip's tab to the other strip's panel.
 */
function tabbedAs(scope: string | undefined, id: string): string {
  return scope === undefined ? id : `${scope}-${id}`
}

export function SectionTabs({ label, tabs, current, onSelect, scope, aside }: {
  label: string
  tabs: { id: string, label: string, badge?: ReactNode }[]
  current: string
  onSelect: (id: string) => void
  scope?: string
  /**
   * What is shown at the far end of the strip, outside the tabs: a pane's way of
   * arranging itself, which is about the box and so belongs on the box's own
   * top edge rather than on a bar above it.
   */
  aside?: ReactNode
}) {
  const strip = useRef<HTMLDivElement>(null)

  function move(to: number) {
    const at = (to + tabs.length) % tabs.length
    const next = tabs[at]
    if (next === undefined) return
    onSelect(next.id)
    strip.current
      ?.querySelector<HTMLButtonElement>(`#tab-${CSS.escape(tabbedAs(scope, next.id))}`)
      ?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const at = tabs.findIndex((tab) => tab.id === current)
    if (event.key === "ArrowRight") move(at + 1)
    else if (event.key === "ArrowLeft") move(at - 1)
    else if (event.key === "Home") move(0)
    else if (event.key === "End") move(tabs.length - 1)
    else return
    event.preventDefault()
  }

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex flex-wrap items-end border-line border-b px-4"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tabbedAs(scope, tab.id)}`}
          aria-selected={tab.id === current}
          aria-controls={`tabpanel-${tabbedAs(scope, tab.id)}`}
          tabIndex={tab.id === current ? 0 : -1}
          onClick={() => { onSelect(tab.id) }}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-[3px] px-4 py-2 text-sm ${
            tab.id === current
              ? "border-brand font-semibold text-brand"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
      {aside !== undefined && <span className="ml-auto flex items-center py-1 pl-4">{aside}</span>}
    </div>
  )
}

export function TabPanel({ id, current, children, scope }: {
  id: string
  current: string
  children: ReactNode
  scope?: string
}) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabbedAs(scope, id)}`}
      aria-labelledby={`tab-${tabbedAs(scope, id)}`}
      hidden={id !== current}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------- collapsing and lists */

/**
 * The shading on an edge a box can still travel towards.
 *
 * **A box that scrolls inside itself implies nothing about it.** Where the reader
 * has the bar set to appear only while scrolling — the default on macOS — it
 * claims no space at all: measured at 0px on both the listing's table and the
 * panel's list of values. So the box shows it, and shows it before being touched.
 * The far edge is shaded from the moment the page opens, and the shading goes
 * when there is nothing left that way.
 *
 * **A shadow rather than a fade to the page behind.** In the table the same
 * strip crosses the coloured header bar and the white rows under it, and a shadow is
 * the one drawing that means the same thing on both.
 */
export const EDGE_SHADE = {
  left: "pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-deep/20 to-transparent",
  right: "pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-deep/20 to-transparent",
  top: "pointer-events-none absolute inset-x-0 top-0 h-4 bg-linear-to-b from-deep/20 to-transparent",
  bottom: "pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-linear-to-t from-deep/20 to-transparent",
}

/**
 * What is about to be replaced, while its replacement is on its way.
 *
 * **Pale rather than gone.** What is on screen is still the answer to the search
 * behind it, so it stays readable — and a block that empties itself moves
 * everything under it twice for one refinement.
 *
 * **It stays live.** A reader who reaches for another value while the last one
 * is still arriving means to go there, and a pane that stopped taking presses
 * would drop that. The pointer shows which of the two is happening.
 *
 * **The fade is on the way in and out**, so a state that lasts 40ms past the
 * delay does not blink.
 */
export const PALE = {
  on: "cursor-progress opacity-60 transition-opacity",
  off: "transition-opacity",
}

/**
 * A part of a panel that can be collapsed away.
 *
 * A `<details>`, so the markup records what is open, the browser tells
 * assistive software about it, and a page with no script collapses as well as one
 * with it.
 *
 * **`open` is a reason to be open, not the state of being open.** A section
 * holding a chosen value has to be seen — a condition in force that cannot be
 * seen is a listing that lies about itself — but when that reason goes away,
 * the reader has not asked for the section to be put away. Handing `open`
 * straight to the element makes the two the same thing, and lifting the last
 * condition of a facet would close it under a reader who was reading it. So
 * the reason opens it, and only the reader closes it.
 */
/**
 * Whether a collapsible is open, after the reason for it to be open changed.
 *
 * **A reason opens it, and only the reader closes it.** Written as `reason`
 * alone, a facet whose last condition was lifted would collapse up under a reader
 * who was reading it: the reason went away, but nobody asked for the section to
 * be put away.
 */
export function collapsibleOpen(shown: boolean, reason: boolean): boolean {
  return reason || shown
}

/**
 * The indicator of something that opens in place: a chevron that turns down
 * while its `<details>` (named `group/collapsible`) is open. **Not `Chevron`** — this
 * one turns rather than moves, being a collapsible rather than a link somewhere.
 */
export function CollapsibleChevron() {
  return <Icon name="chevron-right" className="shrink-0 text-ink-muted transition-transform group-open/collapsible:rotate-90" />
}

export function Collapsible({ summary, note, open = false, children }: {
  summary: ReactNode
  /** What the section is worth glancing at while closed. */
  note?: ReactNode
  /** Whether there is a reason for this to be open right now. */
  open?: boolean
  children: ReactNode
}) {
  const [shown, setShown] = useState(open)
  const [reason, setReason] = useState(open)
  if (open !== reason) {
    setReason(open)
    setShown(collapsibleOpen(shown, open))
  }
  // No rule of its own: a column of these wants one between them, which the
  // column draws (`divide-y`), and a single one on a page wants none at all —
  // a lone rule under one collapsible reads as the bottom of something.
  //
  // **The padding is on the summary rather than on the `<details>`.** It draws
  // the same distances either way, but only one of them is inside the thing
  // that gets pressed: on the outside it left a 22.4px target — the line of
  // words and nothing else — under 8px of margin nobody could press.
  return (
    <details
      open={shown}
      onToggle={(event) => { setShown(event.currentTarget.open) }}
      className="group/collapsible"
    >
      <summary className="flex list-none items-center justify-between gap-2 py-2 font-semibold text-sm marker:content-none">
        <span className="flex items-center gap-1.5">
          <CollapsibleChevron />
          {summary}
        </span>
        {note !== undefined && <span className="text-ink-muted text-xs">{note}</span>}
      </summary>
      <div className="pb-2 pl-5">{children}</div>
    </details>
  )
}

/**
 * A list truncated to a few entries, with the rest behind the count of them.
 *
 * **The rest open where they were cut.** A cell in a listing sits on a row the
 * reader is holding against the rows above and below it, and a link that took
 * them to another page to read three more accessions would cost them the
 * comparison they opened the listing for. So the count is a control rather than
 * a link, and what it reveals arrives in the same cell.
 *
 * **What opens is all of it.** A list that opened to a scrolling box of a dozen
 * entries read as a list that had not finished opening — the box's scrollbar
 * is hidden until touched, so the sixtieth accession looked absent rather than
 * further down. The row grows instead, and the same control closes it again.
 */
export function Clamped({ items, shown = 3, more, less }: {
  items: ReactNode[]
  shown?: number
  /** What the rest are called, given how many there are. */
  more: (rest: number) => ReactNode
  /** What the control shows once the rest are showing. */
  less: ReactNode
}) {
  const [open, setOpen] = useState(false)
  // **One left over is never worth a control.** The control takes 18px against
  // the 22.4px the entry itself would, and this column is not the one that
  // decides how tall its row is — measured over a hundred research rows, the
  // twelve cells with exactly one hidden would every one of them have shown it
  // without the row growing by a pixel. So the last entry is kept rather than
  // traded for a press that reveals one accession.
  const cut = items.length - shown > 1
  const rest = items.length - shown
  return (
    <>
      <ul>
        {(open || !cut ? items : items.slice(0, shown)).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      {cut && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
          className={MORE}
        >
          {open ? less : more(rest)}
          {/* Turned to point back the way it came, so that the one drawing shows
              both "there is more this way" and "put it back". */}
          <Icon name="chevron-right" aria-hidden="true" className={open ? "-rotate-90" : ""} />
        </button>
      )}
    </>
  )
}

/**
 * A cell's worth of prose, truncated to a few lines with the rest a press away.
 *
 * **Cut, not scrolled.** A box that scrolls inside a table row requires the reader
 * to find a second bar inside the one they are already using, and on a page of
 * twenty research rows fourteen of them appear at once. What is shown fades
 * into the row instead, which shows there is more without requesting anything;
 * the previous portal drew the same fade and put the rest behind a dialog.
 *
 * **The rest open in place**, the way a shortened list does (`Clamped`), and
 * under the same ceiling — one of these runs to ninety-four lines, and a row
 * grown to hold it would put everything below it off the screen.
 *
 * The control appears only where there is something behind it, which is
 * measured rather than guessed: how many lines a paragraph takes depends on the
 * width its column ended up with, and that is not known until it is drawn.
 */
export function Excerpt({ more, less, children }: {
  /** What the control shows while the rest are hidden. */
  more: ReactNode
  /** What it shows once they are showing. */
  less: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = body.current
    if (el === null) return
    // Against the shut height rather than the current one: open, the box is as
    // tall as its contents, and checking whether it overflows would return no and
    // take away the control that closes it.
    const measure = () => {
      setCut(el.scrollHeight > SHUT + 1)
    }
    measure()
    const watch = new ResizeObserver(() => {
      measure()
    })
    watch.observe(el)
    return () => {
      watch.disconnect()
    }
  }, [])

  return (
    <>
      <div
        ref={body}
        className={open ? "max-h-72 overflow-y-auto" : "relative max-h-24 overflow-hidden"}
      >
        {children}
        {!open && cut && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-white to-transparent" />
        )}
      </div>
      {cut && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
          className={MORE}
        >
          {open ? less : more}
          <Icon name="chevron-right" aria-hidden="true" className={open ? "-rotate-90" : ""} />
        </button>
      )}
    </>
  )
}

/** How tall a shut `Excerpt` is, in the units its own class is written in. */
const SHUT = 96

/**
 * Words given as lines. **One string is one line**, so a note of two points
 * breaks where the second begins rather than where the box happens to end —
 * the same rule as a section's note (`page.tsx` の `Section`). Only a note that
 * reads badly run together is given as several; most are one string.
 */
export type Lines = string | readonly string[]

export function LinesOf({ text }: { text: Lines }) {
  return typeof text === "string"
    ? <>{text}</>
    : <>{text.map((line) => <span key={line} className="block">{line}</span>)}</>
}

/* ------------------------------------------------------------------ notes */

/**
 * A remark set apart from the text around it.
 *
 * White with a thin coloured edge, which is how v1 draws the one it uses on the
 * public pages. The four kinds are the ones the old articles were written with,
 * and the markdown that came from them still identifies them.
 */
export type NoteKind = "plain" | "info" | "tip" | "warning" | "danger" | "done"

export const NOTE_KIND: Record<NoteKind, { icon: IconName | null, className: string }> = {
  /**
   * The quietest one, and the only one without a glyph: an aside that needs
   * setting apart from the paragraphs and implies nothing about urgency. It is
   * what `> [!NOTE]` draws in an article (`public/markdown.server.ts`).
   */
  plain: { icon: null, className: "border-line-strong" },
  info: { icon: "info", className: "border-brand text-brand" },
  tip: { icon: "tip", className: "border-ink-muted text-ink-muted" },
  warning: { icon: "warning", className: "border-warning text-warning" },
  danger: { icon: "alert", className: "border-danger text-danger" },
  /** What a form did, when it did it. */
  done: { icon: "check", className: "border-line-strong text-ink-muted" },
}

export function Note({ kind = "info", live = false, action, children }: {
  kind?: NoteKind
  /**
   * Whether this appeared in answer to something the reader did. A save that
   * replies on the same page is otherwise silent to anybody not watching that
   * corner of the screen.
   */
  live?: boolean
  /** A control belonging to the note, such as the way to close it. */
  action?: ReactNode
  children: ReactNode
}) {
  const { icon, className } = NOTE_KIND[kind]
  return (
    <Remark box={`bg-white ${className}`} icon={icon} live={live} action={action}>
      {children}
    </Remark>
  )
}

/**
 * A note in the corner of the window, for a response with nowhere to sit on the
 * page.
 *
 * **The page does not move for it.** It is drawn over the corner rather than in
 * the flow, so the row the reader just pressed stays where it is; a notice that
 * pushed the page down would move whatever they were about to press next.
 *
 * **The spoken part is separate from the drawn part, and never leaves the
 * page.** A live region is announced when its contents change — a region that
 * arrives already holding its message may show nothing at all, which is what a
 * box appearing and disappearing would be. So the region remains empty between
 * notices and the box comes and goes beside it. Saying it twice is the other
 * failure, so the box itself is not live.
 *
 * **It does not take focus**, since pulling focus out of a listing would lose
 * the reader's place. That is also why the strip takes no pointer events while
 * the box does: the page underneath stays reachable.
 *
 * **Over the top of what the reader is reading, not in a corner of the window.**
 * A corner is the furthest point from where anybody is working, and a notice
 * left there is missed however loud it is drawn. This sticks to the head of the
 * page's own content, so it lands on the first rows of whatever listing raised
 * it — and stays there as the reader scrolls, because the press could have come
 * from any row.
 *
 * **It lies over the rows rather than pushing them down.** The strip itself has
 * no height and the box is absolute inside it: a notice that moved the table
 * would shift the next row the reader was about to press.
 *
 * **The two offsets answer two different questions and have to be set apart.**
 * One is where the box sits before anything has been scrolled; the other is
 * where the strip comes to rest once the page has moved under it. A reader who
 * has scrolled gets the notice near the top of the window whichever placing is
 * in force, because the strip is what stops and the box keeps its distance
 * from it.
 *
 * **Which placing a screen takes is where its own name is drawn.** A public
 * page opens with a header bar and a management screen opens with a white card, and
 * the two put the first line the reader looks at in different places — a notice
 * pinned to one of them lands in the middle of the other's words.
 */
/**
 * How long a notice is shown before it goes.
 *
 * **One length, whichever side of the site raised it.** What is said is short
 * on both — a dataset went into the cart, a form was saved — and the reader is
 * looking at the place they just pressed. The box that takes longer to read is
 * the one that shows something went wrong, and that one is held open by being
 * read: the timer stops while a pointer is over it or the focus is inside it.
 */
export const TOAST_MS = 3000

const TOAST_AT = {
  /**
   * The middle of the header bar a public page opens with. Every one of them begins
   * the same way — the page's own padding (16), the trail (22), the gap under
   * it (8) — so what identifies the page starts 46px below the top of `main`; the
   * header bar is 71px tall, which puts its middle at 81.5 and the middle of a 56px
   * notice at 53.5. 56 is the nearest step and lands 2px under it. `-top-10`
   * then cancels all but 16px of that, so a scrolled reader gets the notice a
   * plain 16px from the top of the window.
   */
  headerBar: { strip: "-top-10", box: "top-14" },
  /**
   * The middle of the line a management screen is named in. Every one of them
   * opens with a card holding a heading — 24 of padding and a 39px line — so
   * that middle is 43.5px below the top of the card. **The box is centred on that
   * rather than hung from it**, because what it holds is one sentence on some
   * screens and two on others, and a notice measured from its own top would sit
   * lower the more it had to show. `top-2` is where the strip stops, which keeps
   * the middle of the box 51.5px from the top of the window once the page has
   * moved under it.
   */
  head: { strip: "top-2", box: "top-[43.5px] -translate-y-1/2" },
}

export function Toast({ label, announce, at = "headerBar", children }: {
  label: string
  /** What is said aloud. Empty between notices. */
  announce: string
  /** Which of the two lines the screen names itself in (`TOAST_AT`). */
  at?: keyof typeof TOAST_AT
  children?: ReactNode
}) {
  return (
    <div
      aria-label={label}
      className={`pointer-events-none sticky ${TOAST_AT[at].strip} z-30 flex h-0 justify-center`}
    >
      <p role="status" className="sr-only">{announce}</p>
      {children !== undefined && (
        <div
          className={`pointer-events-auto absolute ${TOAST_AT[at].box} w-fit max-w-2xl shadow-2xl motion-safe:animate-rise`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------- requesting and busy */

/**
 * A panel drawn over the page, and the control that opens it.
 *
 * **Every panel is built the same way, and the panel builds it.** Its name,
 * then the one sentence it has to show, then what is written in it, then the
 * row at the foot with the cancel button on the left and the action on the right — the
 * order a screen's own name row keeps. A screen
 * hands over the fields and the action and nothing else: a sentence a screen
 * wrote itself stood wherever the screen put it, and two panels came to show
 * the same kind of thing in two places.
 *
 * **The sentence is the panel's; the hint is the field's.** What pressing does
 * is said once under the name, in the reading colour. How a value is written
 * is said under the box it is written in, in the quieter one (`form.tsx` の
 * `hint`). Neither shows the other's thing, so a reader who has learned where
 * each sits knows what each is before reading it.
 *
 * **Nothing is inside it until it is open.** A submit button left in a closed
 * panel is still the form's default button, so pressing Enter in a box
 * elsewhere in the same form would fire the action nobody asked for; and a form
 * holding two of these would send both sets of fields.
 *
 * **It opens a beat after the press.** The browser gives focus at the moment
 * the panel opens, and only to what is there — opening in the same breath as
 * the press hands focus to the empty panel itself, and the reader has to tab
 * into it before the cancel button is under their hands.
 *
 * **The panel is in the form it is written in**, so the fields inside it are
 * the ones the browser sends; what the top layer moves is where it is drawn,
 * not where it belongs.
 *
 * **It is one width, not the width of its words — and the same one whether it
 * shows a question or is written in.** These are shown over screens that have nothing else to
 * look at, so a panel drawn to fit a short sentence came out 288px against the
 * 448px of the one beside it, and the same question changed size with the
 * length of the answer. A panel that shows a question and a panel with fields in it are
 * opened from the same screen, and at two sizes they read as two kinds of
 * thing; at one, the reader sees the same panel every time and reads what is
 * different about it. The width is the one two language boxes stacked can be
 * read in, and it gives way only to a window narrower than that. **The one
 * other width is for two values set side by side** (`wide`): a comparison
 * halves the width it is given, and at 672px each side is a column of a few
 * words.
 */
export function Dialog({ label, title, note, variant = "secondary", size = "sm", icon, held, dismiss, action, status, children, disabled, reasonAt, wide = false }: {
  /** The trigger, when the panel has one of its own. */
  label?: string
  /**
   * Why the trigger cannot be pressed, when it cannot.
   *
   * **The trigger stays on the screen and shows why.** Taken away, it is looked
   * for among the other controls; left pressable, the panel opens only to be
   * refused. The reason is drawn over the trigger while the pointer is on it or
   * it has focus, and read out with the button (`Button` の `disabled`).
   */
  disabled?: string
  /** Which edge of the trigger the reason hangs from (`Button` の `reasonAt`). */
  reasonAt?: "left" | "right"
  /**
   * What the panel is about, shown at the top of it.
   *
   * **The trigger and the panel do not show the same thing.** The control is a
   * word in a row of controls and reads as an instruction; the panel is a
   * screen of its own, and a reader who has arrived at one needs to know which
   * of the things on the page underneath it is about to be acted on.
   */
  title: string
  /**
   * What pressing does, said once under the name.
   *
   * **It closes the way the action can be taken back.** What cannot be undone
   * ends by indicating so; what can, ends by indicating how — a reader deciding whether
   * to press is deciding on exactly that.
   */
  note?: Lines
  /** The style of the trigger, which is the style of what it opens. */
  variant?: ButtonVariant
  /**
   * How large the trigger is drawn. The panel it opens is one size whatever
   * this shows — what changes is only how the control sits among its
   * neighbours, and in a table's row that is `row`.
   */
  size?: ButtonSize
  icon?: ReactNode
  /**
   * Held open from outside, for a panel that opens because something was added
   * rather than because a control was pressed. **The trigger is not drawn** —
   * whatever opened it is the trigger.
   */
  held?: { open: boolean, close: () => void }
  /**
   * The word on the cancel button, which every panel has. **「キャンセル」 unless
   * the panel has nothing to throw away**, in which case it is 「閉じる」 and
   * the caller specifies it.
   */
  dismiss?: string
  /**
   * The action, at the right of the foot, handed the way to shut the panel for a
   * action that is not a form being sent.
   *
   * **A panel without one writes as it goes** (`fields.tsx` の `ItemList`), and
   * its cancel button uses the outlined style: it is the one thing there to press,
   * and the word-only style is for a cancel button shown beside an action.
   */
  action?: (close: () => void) => ReactNode
  /**
   * What the action's save is doing (`form.tsx` の `Unsaved`), at the left of
   * the foot. **Not beside the buttons**: it keeps the room of its longest word
   * whether or not a word is shown, and to their right that room pushed the
   * buttons off the panel's right edge.
   */
  status?: ReactNode
  /** What is written in the panel — the fields, and only those. */
  children?: ReactNode
  /** Two values side by side, which need twice the width of one. */
  wide?: boolean
}) {
  const box = useRef<HTMLDialogElement>(null)
  const [ownOpen, setOwnOpen] = useState(false)
  const open = held?.open ?? ownOpen
  const close = held === undefined
    ? () => { setOwnOpen(false) }
    : held.close
  /*
    **While the action the panel sent is in flight, the panel holds.** It is the
    one thing over the page, so whatever is being sent came from it; and a way
    out taken then would leave the reader on the page with no sign of an action
    that is still going to land. The action's own button says it is waiting; the
    three ways to close it — the foot, Escape and the dark outside — are shut until
    the sending has ended.
  */
  const submitting = useSubmitting()
  const holding = open && submitting

  /*
    **The close control that costs nothing to find.** A panel over the page is shut by
    Escape and by whatever its own contents offer, and pressing the dark outside
    it is the third — the same three a `Menu` has.

    **Outside is measured against the panel's own rectangle**, not by checking
    whether the press landed on the `<dialog>` element: the element is the
    backdrop *and* the box, so its own 24px of padding would otherwise count as
    outside and shut the panel from within.

    **The press has to start outside as well as end there.** A word selected
    inside the panel and released past its edge is not somebody asking to leave.
  */
  const pressedOut = useRef(false)
  const outside = (at: { clientX: number, clientY: number }): boolean => {
    const el = box.current
    if (el === null) return false
    const r = el.getBoundingClientRect()
    return at.clientX < r.left || at.clientX > r.right
      || at.clientY < r.top || at.clientY > r.bottom
  }

  // **Whether it is open is the state, and the element follows it**, rather
  // than the two being set from different places. Closing it is something the
  // panel's own contents request, and a caller handed the element's `close`
  // would be shutting the panel while the state still said it was open.
  useEffect(() => {
    const el = box.current
    if (el === null) return
    if (open) el.showModal()
    else if (el.open) el.close()
  }, [open])

  return (
    <>
      {held === undefined && label !== undefined && (
        <Button
          type="button"
          variant={variant}
          size={size}
          icon={icon}
          disabled={disabled}
          reasonAt={reasonAt}
          onClick={() => { setOwnOpen(true) }}
        >
          {label}
        </Button>
      )}
      <dialog
        ref={box}
        onClose={close}
        onCancel={(event) => { if (holding) event.preventDefault() }}
        onPointerDown={(event) => { pressedOut.current = outside(event) }}
        onClick={(event) => {
          if (holding) return
          if (event.target === box.current && pressedOut.current && outside(event)) close()
        }}
        aria-busy={holding || undefined}
        /* **The panel wraps its own words.** It is drawn in the top layer but
           inherits from where it is shown in the markup, and a row's cell that
           holds its controls on one line would otherwise hand the panel that
           line too: the words inside would run off the side instead of
           breaking. The weight and colour are set for the same reason — a
           indicator on a header bar's title opened a panel written in bold. */
        className={`m-auto max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto whitespace-normal rounded-lg border border-line bg-white p-6 font-normal text-ink shadow-lg backdrop:bg-ink/40`}
      >
        {open && (
          <Stack gap="normal">
            {/* The heading a pane uses, at the size a bar's does: the panel is
                narrow and everything under it is `text-sm`, so a page-sized
                title in here is half again as tall as it has anything to show.
                The rule starts on the line rather than hanging out through a
                card's padding, because there is no card around it. */}
            <Heading level="h2" look="bar" rule="start" title={title} />
            {note !== undefined && <p className="text-ink text-sm"><LinesOf text={note} /></p>}
            {children}
            <span className="flex flex-wrap items-center justify-end gap-2">
              {status !== undefined && <span className="mr-auto">{status}</span>}
              <Button
                type="button"
                variant="secondary"
                disabled={holding}
                onClick={close}
              >
                {dismiss ?? messagesFor("ja").admin.cancel}
              </Button>
              {action?.(close)}
            </span>
          </Stack>
        )}
      </dialog>
    </>
  )
}

/**
 * Something that cannot be undone, asked about over the page.
 *
 * **The question does not open inside the row it was asked from.** These stand
 * in lists and in table cells beside other things, and a warning is a whole
 * sentence: expanded in place it pushes its neighbours sideways, and a row that
 * held two of them could ask twice at once. Over the page the row stays where
 * it was, the panel cannot run off the edge of the window wherever the control
 * happens to sit, and the keyboard comes with it — `Esc` closes, and focus
 * starts on the cancel button rather than on the action.
 *
 * **What is being acted on is named in the title, not left to the warning.**
 * The warning shows what will happen, not which of the four things in the row it
 * will happen to.
 *
 * **The warning is the panel's own sentence** (`Dialog` の `note`), and it is
 * not drawn in the danger colour. What is dangerous here is the action, and the
 * button that does it is shown with that colour; a sentence in the same red is the
 * panel shouting the part the reader has to read most carefully, and red text
 * at 14px is the worst of the three places this screen could put that colour.
 */
export function Confirm({
  label,
  title,
  warning,
  confirm,
  cancel,
  intent,
  icon = "trash",
  size = "sm",
  held,
  onConfirm,
  children,
  disabled,
  reasonAt,
}: {
  /** The trigger. Absent when the panel is `held` open from outside, which draws none. */
  label?: string
  /** What is about to happen and to which one, as a heading. */
  title: string
  warning: string
  /** Why the trigger cannot be pressed, when it cannot (`Dialog`). */
  disabled?: string
  /** Which edge of the trigger the reason hangs from (`Button` の `reasonAt`). */
  reasonAt?: "left" | "right"
  confirm: string
  /** The cancel button; 「キャンセル」 on every confirmation, so none passes it. */
  cancel?: string
  /**
   * What the form is being asked to do, put on the button rather than into a
   * hidden field.
   *
   * **Where a form holds more than one of these, it has to be this and not a
   * child.** A hidden field is submitted whichever button was pressed, so two
   * open confirmations in one form would send two intents and the reader would
   * get whichever came first in the markup.
   */
  intent?: string
  /** The indicator on the confirming button. Taking something away is the default. */
  icon?: IconName
  /**
   * How large the trigger is drawn (`Dialog`). **The panel keeps its own size**:
   * it is a screen of its own and the action in it is the thing being pressed,
   * whereas the trigger is shown beside what it acts on.
   */
  size?: ButtonSize
  /**
   * Held open from outside (`Dialog`), for a question raised by something that
   * happened rather than by a control being pressed — files chosen whose names
   * the box already holds. The trigger is whatever raised it.
   */
  held?: { open: boolean, close: () => void }
  /**
   * The action, where it is not a form being sent.
   *
   * **The panel is one part however the action is done.** Most of these are shown in
   * a form and the button in them submits it; a screen that talks to a service
   * from the browser has nothing to submit, and drawing its own panel would put
   * a second way of asking the same question on the site. The panel shuts
   * itself before the action runs, so nothing is left over the page waiting on an
   * answer.
   */
  onConfirm?: () => void
  /** The hidden fields naming what is being acted on. */
  children?: ReactNode
}) {
  // **The action waits in place while it is in flight** (`Submit` の同じ形):
  // pressed again it would send twice, and renamed or grown it would move the
  // cancel button beside it. Only an action that is a form being sent has anything to
  // wait for; one done in the browser shuts the panel first.
  const { pending, press } = usePressed()
  return (
    /* **The trigger is styled as what it leads to.** Taking something away
       is what this control is for whichever screen it is shown on, and the panel
       it opens has said so in `danger` all along — the trigger was the one part
       of the sequence still drawn as an ordinary choice.

       **It is shown at the height of the controls it is shown among.** Rows pair it
       with an ordinary submit — a version with the button to take it out of sight,
       a dataset id with the way to attach one — and a control 8.4px shorter
       than its neighbour moves the row's height with whichever of the two the
       state calls for. What tells it apart from that neighbour is the colour,
       which it keeps at any size.

       **The indicator is on the trigger as well as on the action.** It is the same
       action at both ends, and a row of words with one glyph among them reads as
       one of them being of a different kind. */
    <Dialog
      label={label}
      title={title}
      note={warning}
      variant="danger"
      size={size}
      icon={<Icon name={icon} />}
      held={held}
      dismiss={cancel}
      disabled={disabled}
      reasonAt={reasonAt}
      action={(close) => (
        <>
          <ShutWhenSent pending={pending} close={close} />
          {children}
          <Button
            type={onConfirm === undefined ? "submit" : "button"}
            variant="danger"
            icon={pending ? <Spinner /> : <Icon name={icon} />}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={onConfirm === undefined
              ? (event) => { press(event.currentTarget.form) }
              : () => {
                  close()
                  onConfirm()
                }}
            {...(intent === undefined ? {} : { name: "intent", value: intent })}
          >
            {confirm}
          </Button>
          {pending && <span role="status" className="sr-only">{messagesFor("ja").admin.busy}</span>}
        </>
      )}
    />
  )
}

/**
 * The panel a menu opens.
 *
 * **An 8px corner rather than the site's 4px.** It is a sheet lying over the
 * page rather than a box set into one, and the shadow that shows it thickens its
 * outline enough to swallow a 4px arc — the same reading as the management
 * area's drawer, which is the only other thing here drawn on top of a screen.
 *
 * The padding above and below is what keeps a line inside it off the curve, so
 * nothing has to be clipped — and clipping would take the focus ring of the
 * first and last lines with it.
 */
/**
 * Shuts a confirming panel once what it sent has been answered.
 *
 * **The action is done, so the question is over.** An action that leaves the screen
 * takes the panel with it, but one answered by coming back to the same screen —
 * reissuing a link, deleting one row of a list — would otherwise leave the
 * panel shown over the result, repeating its question about what has just been done.
 */
function ShutWhenSent({ pending, close }: { pending: boolean, close: () => void }) {
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !pending) close()
    was.current = pending
  }, [pending, close])
  return null
}

export const MENU_PANEL
  = "min-w-max flex-col items-stretch rounded-lg border border-line bg-white py-1 shadow-lg"

/**
 * One line inside it. **Exported because the lines are the caller's** — the
 * navigation puts links in its menu and the account puts a name, a link and a
 * form, and the panel has no way to wrap what it is given without deciding
 * which of those it is.
 */
export const MENU_ITEM
  = "block whitespace-nowrap px-4 py-2 text-sm no-underline hover:bg-surface-hover"

/**
 * The same line when it identifies where the reader already is. Written out whole
 * rather than added to the one above, because two classes for one property are
 * settled by the order the styles happen to be in.
 */
export const MENU_ITEM_HERE
  = "block whitespace-nowrap px-4 py-2 font-bold text-brand text-sm no-underline hover:bg-surface-hover"

/**
 * Which corners a menu's own control rounds. `left` is for the one `Chooser`
 * welds something to: the hover fill runs to the edge of the box, so a square
 * corner under a rounded border shows as a notch.
 */
const MENU_CORNER = { all: "rounded-full", left: "rounded-l-full" }

/**
 * A `<details>` that closes the three ways a panel hanging off a control has to:
 * on Escape, on a press anywhere else, and on going somewhere. Give the returned
 * ref to the `<details>`.
 *
 * **A panel that only closes by pressing its own control again stays open over
 * the page** while the reader goes on doing something else — the one in the bar
 * covers the top right corner of every screen, and an edit screen has dozens
 * of the indicators beside its fields. The two listeners are on the document because
 * the press that should close it is by definition not on this element; they are
 * attached once and do nothing while it is shut. **A client-side move does not
 * reload the page**, so arriving somewhere has to close it too, which is what
 * the address is watched for. Escape hands focus back to the `<summary>`:
 * closing a panel the reader is inside would otherwise leave focus on nothing.
 *
 * **Every such panel goes through here**, so that no panel can close fewer ways
 * than the others.
 */
export function useDismissible() {
  const box = useRef<HTMLDetailsElement>(null)
  const { key } = useLocation()

  useEffect(() => {
    if (box.current !== null) box.current.open = false
  }, [key])

  useEffect(() => {
    const element = box.current
    if (element === null) return

    const onPress = (event: PointerEvent) => {
      if (!element.open) return
      if (event.target instanceof Node && element.contains(event.target)) return
      element.open = false
    }
    const onKey = (event: KeyboardEvent) => {
      if (!element.open || event.key !== "Escape") return
      element.open = false
      element.querySelector("summary")?.focus()
    }

    document.addEventListener("pointerdown", onPress)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPress)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  return box
}

/**
 * A set of actions that would crowd the row they belong to.
 *
 * A `<details>`, so what it holds is in the markup and its own control opens it.
 * It closes the way every panel off a control does (`useDismissible`).
 */
export function Menu({ label, icon = "more", glyph, round = false, filled = false, word = false, count, value, corner = "all", children }: {
  label: string
  icon?: IconName
  /**
   * What is shown in the control in place of a glyph — the letter an account is
   * drawn by, where a picture of a person would show less than their own name
   * does. It replaces the icon rather than joining it: the control is 36px and
   * holds one thing.
   */
  glyph?: ReactNode
  /** In the top bar, where the controls on either side of it are circles. */
  round?: boolean
  /**
   * Whether the circle is filled, which only a round one can be.
   *
   * **The fill is a state, not a rank.** In the top bar it shows somebody is
   * signed in — the outlined circles beside it are the same controls whoever is
   * looking, and this one is not.
   */
  filled?: boolean
  /** How many the panel holds, when that is worth indicating before it opens. */
  count?: number
  /**
   * Whether the name is drawn beside the glyph.
   *
   * **The navigation's own menu shows what it is.** A glyph alone is read as
   * "more of what I am looking at" — which is what it means everywhere else on
   * the site — and the one in the bar holds destinations rather than actions.
   */
  word?: boolean
  /**
   * What is chosen now, when the menu is a choice rather than a set of actions.
   *
   * The control then draws that value and a caret instead of a glyph, and
   * **the edge around it belongs to `Chooser`** — a choice is read against the
   * word indicating what it chooses, and the two have to sit in one box.
   */
  value?: string
  /** Which corners the control rounds, since `Chooser` may weld one to it. */
  corner?: keyof typeof MENU_CORNER
  children: ReactNode
}) {
  const box = useDismissible()

  return (
    <details ref={box} className="relative inline-block">
      <summary
        aria-label={word ? undefined : label}
        title={word ? undefined : label}
        className={`relative inline-flex list-none items-center justify-center gap-1.5 marker:content-none hover:bg-surface-hover ${
          value !== undefined
            // A control naming a choice is a step shallower than a button, and a
            // step narrower on the side the caret is: the row it
            // shares already holds 36px squares in it, and a caret has
            // whitespace of its own the way a letter does not.
            ? `whitespace-nowrap py-1 pr-2 pl-3 text-sm ${MENU_CORNER[corner]}`
            // The filled circle is written out whole rather than added to the
            // outlined one: they disagree about the colour of the word and the
            // edge, and two classes setting one property are settled by the
            // order the styles happen to be in.
            : `min-h-tap ${filled
              ? `size-tap rounded-full border border-transparent text-white hover:brightness-90 ${HEADER_BAR_FILL.brand}`
              : `text-ink-muted hover:text-ink ${word ? "whitespace-nowrap rounded px-2 font-medium text-ink text-sm" : round ? "size-tap rounded-full border border-line" : "size-tap rounded"}`}`
        }`}
      >
        {value === undefined && (glyph ?? <Icon name={icon} className="text-base" />)}
        {value}
        {word && label}
        {value !== undefined && <Icon name="chevron-down" aria-hidden="true" />}
        {count !== undefined && <CountBubble count={count} floating />}
      </summary>
      {/* **Over anything the page holds up on its own** — a stuck header
          (`draft-tools.tsx`, z-20) or a table's stuck columns — and level with
          the notice that reports an operation (`Toast`, z-30): an open menu is
          the newest thing on the screen, and the two never share a place (the
          strip is centred at the top, a menu hangs from the bar's right end).
          Under it, the account menu opened from the bar slid behind the card
          of an editing screen. */}
      <div className={`absolute right-0 z-30 mt-2 flex ${MENU_PANEL}`}>
        {children}
      </div>
    </details>
  )
}

/**
 * A control that identifies what is chosen now and opens the alternatives.
 *
 * **The word indicating what is being chosen stays outside the control.** "並び替え"
 * and "表示件数" are what the value is an answer to, so putting them inside
 * would make the control read as a value with a caption; beside it, the pair
 * reads as one sentence and the box holds only the answer.
 *
 * **Every alternative is an address**, so the choice is shareable, survives a
 * reload and needs no script to make — the panel holds links, not a listener.
 * This is why it is not a `<select>`: a select's options cannot be links, so
 * the same choice would have to exist twice, once as a form and once as the
 * address it writes.
 *
 * `beside` is welded to the right of it and shares the edge, for a second
 * control that has no meaning without the first — the direction an ordering
 * runs in is the only one. **The edge belongs to this box rather than to its
 * halves**: two boxes 1px apart draw a 2px line between them.
 */
export function Chooser({ label, value, beside, children }: {
  label: string
  value: string
  beside?: ReactNode
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={`inline-flex items-stretch rounded-full ${LISTING_CONTROL}`}>
        <Menu
          label={`${label}: ${value}`}
          value={value}
          corner={beside === undefined ? "all" : "left"}
        >
          {children}
        </Menu>
        {beside}
      </span>
    </span>
  )
}

/**
 * The control welded to the right of a `Chooser`, drawn by the caller because
 * only the caller knows where it goes.
 *
 * **It is the height of what it is welded to, not the tap size.** A glyph on
 * its own is 36px square everywhere else, but this one shares an
 * edge with a control sized by its word — held to 36 it would stand the pair
 * over the rest of the row. **The press is 36px all the same**: the
 * pseudo-element names that height and sits centred on the box, so what can be
 * pressed stays put when the box around it changes depth.
 */
export const CHOOSER_SIDE
  = "relative inline-flex w-tap items-center justify-center rounded-r-full border-brand border-l text-brand no-underline after:-translate-y-1/2 after:absolute after:inset-x-0 after:top-1/2 after:h-tap after:content-[''] hover:bg-surface-hover"

/** How far something has got, for the one operation that takes long enough: an upload. */
export function Progress({ label, done, total }: { label: string, done: number, total: number }) {
  const id = useId()
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-ink-muted text-xs">{label}</label>
      <progress id={id} value={done} max={total} className="h-2 w-full">
        {percent}
        %
      </progress>
    </div>
  )
}
