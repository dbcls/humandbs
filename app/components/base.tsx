/**
 * The parts every screen is built from.
 *
 * Nothing here knows about research, drafts or documents — a part takes what to
 * draw and how loud it should be, and the screen supplies the meaning. That is
 * the line between this file and the rest of `app/components/`: `page.tsx` holds
 * the frame a page sits in and the way a content value is drawn, and the
 * screen-shaped files above it hold the arrangements.
 *
 * **The look is carried over from the previous portal, the code is not.** The
 * band and the white box under it, the ruled heading over a listing, the
 * outlined pill buttons, the trapezoid pair of tabs — those are what make a
 * reader recognise the site, so they are reproduced. What is *not* carried over
 * is v1's vocabulary: it drew rounded corners twenty ways, held four separate
 * badge implementations, and used its own palette and Tailwind's side by side.
 * There is no v1 to defer to on those, so each is decided once, here.
 *
 * Every part is drawn against real rows at `/dev/ui`.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router"

import { Icon, type IconName } from "~/components/icons"

/* ---------------------------------------------------------------- rhythm */

/**
 * How far apart two things sit when one is above the other.
 *
 * **There are three distances and a screen may not invent a fourth.** `tight`
 * is a label and the thing it labels, `normal` is two things inside one box,
 * and `block` is one part of a page and the next. The screens used to carry
 * their own margins and had accumulated eleven different ones — `mt-1` beside
 * `mt-2` beside `mt-3` for the same relationship on different pages — which is
 * what makes a site look assembled rather than drawn.
 *
 * **A public screen writes no vertical margin at all**, which
 * `app/app.spacing.test.ts` checks.
 */
const STACK_GAP = { tight: "gap-2", normal: "gap-4", block: "gap-8" }

export function Stack({ gap = "normal", as: Tag = "div", children }: {
  gap?: keyof typeof STACK_GAP
  /** A list of things is a list; anything else is a plain box. */
  as?: "div" | "ul" | "section" | "nav"
  children: ReactNode
}) {
  return <Tag className={`flex flex-col ${STACK_GAP[gap]}`}>{children}</Tag>
}

/* ------------------------------------------------------- marks and boxes */

/**
 * The three parts a remark is made of, as class names.
 *
 * **Exported because site content has remarks too.** A blockquote in a document
 * is an aside rather than a quotation, and the markdown pipeline builds this
 * same box for it (`public/markdown.server.ts`). Two boxes assembled from two
 * lists of classes drift apart; this is the one list.
 */
export const MARKED = {
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
    <span className={MARKED.icon}>
      <Icon name={name} className={`text-base ${className}`} />
    </span>
  )
}

/**
 * A remark with a glyph at its head: the notices above the page, the asides in
 * an article, and what a form says it did.
 *
 * They differ in colour and in what they are for; the shape is one shape. Every
 * one of them is drawn here, so the padding, the gap, the corner and the way the
 * glyph is aligned cannot drift apart between them.
 *
 * **The glyph sits at the middle of the box rather than at its first line.** A
 * notice runs to two or three lines as often as to one, and a mark left at the
 * top of a paragraph reads as belonging to the first line of it rather than to
 * the whole; v1 centres it for the same reason. The way out is centred with it.
 */
function Marked({ box, icon, iconClass = "", live = false, action, children }: {
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
      className={`${MARKED.box} ${box}`}
    >
      {icon !== null && <LineIcon name={icon} className={iconClass} />}
      <div className={MARKED.body}>{children}</div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ bands */

/**
 * The coloured bar that names what is below it.
 *
 * **A band is for a page about one thing that has a name of its own** — this
 * research, this dataset, this draft. A listing or an article gets a `Heading`
 * instead. Keeping the two apart is what makes the band mean something: v1 does
 * the same, and a site where every page opens with the same bar says nothing
 * with it.
 *
 * `deep` is the subject itself, `brand` the sections and tables under it,
 * `accent` the one call to action a page may have.
 *
 * **The filled round controls take the same three.** A circle in the top bar
 * and the button in the search box are small enough that a flat fill and a
 * gradient are told apart only when they sit beside a band — which is exactly
 * where they sit, so they take the band's.
 */
export type BandTone = "brand" | "deep" | "accent"

export const BAND_FILL: Record<BandTone, string> = {
  brand: "bg-linear-to-r from-brand-dark to-brand-light",
  deep: "bg-linear-to-r from-deep to-ink-muted",
  accent: "bg-linear-to-r from-accent to-accent-light",
}

export function Band({ tone = "brand", className = "", children }: {
  tone?: BandTone
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-white ${BAND_FILL[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * What a listing or an article opens with: a rule in the brand colour, the
 * title, and — where there is one — how many rows the reader is looking at.
 *
 * The rule is a mark beside the words rather than a second thing to read: at
 * the weight of a heading's own stroke it reads as part of the letters, so it
 * is kept thinner than they are.
 *
 * **It sits on the edge of the box, not inside it.** A heading opens a `Card`
 * (`page.tsx`), and the rule is pulled out through that card's padding so that
 * the title starts on the same line as everything under it. Left inside, the
 * rule indents the title away from its own text and marks nothing.
 *
 * **What sits beside the title is centred on it, not sat on its baseline.** The
 * count and the controls are much smaller than the title, so a shared baseline
 * puts their middles below its middle — measured at 5.7px for the count and
 * 2.8px for the controls, which reads as the title floating above its own row.
 */
export function Heading({ level = "h1", title, count, children }: {
  level?: "h1" | "h2"
  title: string
  count?: string
  children?: ReactNode
}) {
  const Tag = level
  return (
    <div className="-ml-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="flex items-center gap-3 border-brand border-l-4 pl-5">
        <Tag className={`font-bold text-brand ${level === "h1" ? "text-3xl" : "text-xl"}`}>
          {title}
        </Tag>
        {count !== undefined && <span className="text-ink-muted text-sm">{count}</span>}
      </div>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-3 text-sm">{children}</div>
      )}
    </div>
  )
}

/**
 * What names a column standing beside the page rather than the page itself —
 * the refinement panel is the one there is.
 *
 * **It is the page heading's mark one step down, not a new idiom.** A pane is
 * read at its own scale (its text is a step smaller than the page's), so a
 * heading set only in bold weighs the same as the words under it and stops
 * reading as a heading at all — which is what the panel's was doing. The brand
 * rule and the brand colour are what the site already uses to say "this names
 * what follows", and reusing them costs the reader nothing to learn.
 *
 * **The line under it always spans the pane. Where the rule stands is a
 * choice**, and there are two of them (`PANE_RULE`). The line is the pane's;
 * the rule belongs either to the card or to the thing it names.
 */
/**
 * Where the mark stands, and how far the word sits from it.
 *
 * **The gap is forced in one and chosen in the other.** Hung out through the
 * card's padding, the mark has to leave exactly enough for the words to land
 * back on the content edge — 24px out, 4px of rule, 20px of gap. Standing at
 * the start there is nothing to land on, so the gap is only what binds the mark
 * to the word: 10px, which is what db-portal gives its own.
 */
const PANE_RULE = {
  edge: "-ml-6 pl-5",
  start: "pl-2.5",
}

export function PaneHeading({ title, level = "h2", rule = "edge", children }: {
  title: string
  level?: "h2" | "h3"
  /** Where the mark stands. */
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
        carries the body's leading with it (1.75, a 28px line box for a 16px
        word) and the block ends up half again as tall as it has anything to
        say. What tells it apart from the words under it is the mark and the
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
 * A short label that says what something is or what state it is in.
 *
 * **An outline and a colour, never a fill.** A filled badge competes with the
 * bands for the eye, and a listing of forty datasets would be forty blocks of
 * colour. The colour never carries the meaning on its own — the words do, and
 * the badge is unreadable to nobody who cannot tell the colours apart.
 */
export type Tone = "brand" | "accent" | "muted" | "warning" | "danger"

const BADGE_TONE: Record<Tone, string> = {
  brand: "border-brand text-brand",
  accent: "border-accent text-accent",
  muted: "border-line-strong text-ink-muted",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
}

export function Badge({
  tone = "muted",
  onBand = false,
  pill = false,
  dashed = false,
  icon,
  children,
}: {
  tone?: Tone
  /** A badge sitting on a band, where white is the badge rather than the page. */
  onBand?: boolean
  /** Fully rounded, which is the shape v1 gives the ones that lead somewhere. */
  pill?: boolean
  /**
   * A broken edge, for a value that has not been settled yet: what is drawn is
   * the frame a value will go in rather than a value, and the dashes say so
   * without a word.
   */
  dashed?: boolean
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-nowrap border px-2 py-0.5 text-xs ${
        pill ? "rounded-full" : "rounded"
      } ${dashed ? "border-dashed" : ""} ${
        onBand ? "border-white/70 text-white" : `bg-white ${BADGE_TONE[tone]}`
      }`}
    >
      {icon}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- buttons */

/**
 * The one shape every control standing over a listing takes.
 *
 * **A white face, a thin coloured edge and a fully rounded end** — copy, the
 * CSV, the ordering, how many rows a page holds, and the page numbers. v1 draws
 * all of them from a single class for the same reason: they sit in one band
 * across the top of a table, and a reader scanning it should be able to tell
 * what can be pressed without reading any of them.
 *
 * **Measured, the alternative was three faces and two edges.** The choosers
 * were carrying the grey of an input (`surface-input`), the page numbers a
 * `line` border that comes to 2.09:1 — under the 3:1 the site requires of
 * something you can operate — and the export buttons the brand edge. One class
 * ends all three disagreements at once, and `brand` on white is 8.6:1.
 *
 * **Hover is left to the halves**, since a welded pair lights the half under
 * the pointer rather than the whole of itself.
 */
export const LISTING_CONTROL = "border border-brand bg-white text-brand"

/**
 * What a control looks like, by what pressing it does.
 *
 * `primary` is the one thing the screen wants done, and there is at most one on
 * a screen. `soft` is an offer rather than an instruction — the words a reader
 * might try in the search box — and there are several of them at once, so it is
 * filled but lighter than the one thing being asked for. `danger` is reserved
 * for what cannot be undone — unpublishing, deleting, discarding a draft — so
 * that its colour keeps meaning something.
 *
 * `pill` is the outlined, fully rounded shape v1 gives the controls over a
 * listing (copy, export, refine). It is a shape rather than a rank, so it
 * combines with any variant.
 */
export type ButtonVariant = "primary" | "soft" | "accent" | "secondary" | "danger" | "ghost"

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-white hover:brightness-90",
  soft: "border-transparent bg-brand-light text-white hover:brightness-90",
  accent: "border-transparent bg-accent text-white hover:brightness-90",
  secondary: "border-brand bg-white text-brand hover:bg-surface-hover",
  danger: "border-danger bg-white text-danger hover:bg-danger hover:text-white",
  ghost: "border-transparent bg-transparent text-brand hover:bg-surface-hover",
}

const BUTTON_SIZE = {
  /** Beside a value in a panel or a row, where the control is not the subject. */
  xs: "gap-1 px-2 py-1 text-xs",
  sm: "gap-1.5 px-3 py-1.5 text-sm",
  md: "gap-2 px-5 py-2",
  lg: "gap-2 px-8 py-4 text-lg",
}

type ButtonSize = keyof typeof BUTTON_SIZE

function buttonClass(variant: ButtonVariant, size: ButtonSize, pill: boolean, extra: string) {
  return [
    "inline-flex cursor-pointer items-center justify-center border font-medium no-underline transition-colors",
    pill ? "rounded-full" : "rounded",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    extra,
  ].join(" ")
}

interface ButtonLook {
  variant?: ButtonVariant
  size?: ButtonSize
  pill?: boolean
  icon?: ReactNode
  className?: string
}

export function Button({
  variant = "secondary",
  size = "sm",
  pill = false,
  type = "submit",
  icon,
  className = "",
  children,
  ...rest
}: ButtonLook & { children?: ReactNode }
  & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type={type} className={buttonClass(variant, size, pill, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

/**
 * The same shape for something that navigates rather than acts.
 *
 * `external` is for an address no client-side navigation can answer — a file to
 * download, a redirect to the identity provider — where a `<Link>` would ask
 * the route for data instead of following it. `newTab` is separate from it,
 * because leaving in a new tab is something the words beside the control have
 * to say.
 */
export function ButtonLink({
  to,
  variant = "secondary",
  size = "sm",
  pill = false,
  external = false,
  newTab = false,
  newTabLabel,
  icon,
  className = "",
  children,
}: ButtonLook & {
  to: string
  external?: boolean
  newTab?: boolean
  /** Said for anyone not looking at the mark. Required wherever `newTab` is. */
  newTabLabel?: string
  children: ReactNode
}) {
  const shape = buttonClass(variant, size, pill, className)
  const inside = (
    <>
      {icon}
      {children}
    </>
  )
  if (!external) return <Link to={to} className={shape}>{inside}</Link>
  // A new tab is announced rather than just opened, and `noreferrer` keeps the
  // address of the page that opened it out of the other site's log.
  return newTab
    ? (
        <a href={to} target="_blank" rel="noopener noreferrer" className={shape}>
          {inside}
          {newTabLabel !== undefined && <span className="sr-only">{newTabLabel}</span>}
        </a>
      )
    : <a href={to} className={shape}>{inside}</a>
}

/**
 * One of the two things the site is for, drawn at the size that says so.
 *
 * The front page offers exactly two: provide data, or use it. They are the only
 * place a filled block of colour is this large, which is what makes them read as
 * the way in rather than as two more links (v1 does the same, at the same size).
 *
 * **The glyph is above the words rather than beside them.** Set beside them the
 * pair is as wide as the sentence and the button grows to the width of whatever
 * column it stands in; stacked, the block is as wide as its longer line and can
 * be held to the size of a thing you press.
 *
 * **Its gradient is its own, not a band's.** A band has to keep both ends at
 * 4.5:1 for the small white text it carries, which leaves a shade's worth of
 * travel; the one large bold word here is held to 3:1, so the gradient can go
 * far enough to be seen (`app.css`).
 */
const WAY_IN_FILL: Record<"accent" | "brand", string> = {
  accent: "bg-linear-to-r from-accent to-accent-lighter",
  brand: "bg-linear-to-r from-brand to-brand-lighter",
}

export function BigAction({ to, tone, icon, external = false, newTabLabel, children }: {
  to: string
  tone: "accent" | "brand"
  icon: IconName
  /** Leaves the site — the application system, the submission navigator. */
  external?: boolean
  /** Said for anyone not looking at the mark. Required wherever `external` is. */
  newTabLabel?: string
  children: ReactNode
}) {
  const shape = `flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg px-6 py-4 text-center font-bold text-lg text-white no-underline visited:text-white hover:brightness-95 ${WAY_IN_FILL[tone]}`
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
export function IconButton({ name, label, pressed, onBand = false, onClick, type = "button", ...rest }: {
  name: IconName
  label: string
  /**
   * For a control that is on or off.
   *
   * **The state is announced, not only coloured** — and the name stays the same
   * whichever way it is, because a control that renamed itself would be read as
   * "remove … , pressed" and say two opposite things at once.
   */
  pressed?: boolean | "mixed"
  /**
   * On a band, where the page's own colours are unreadable: `ink-muted` on the
   * brand fill is 1.2:1, and the focus ring (brand) disappears entirely. White
   * is 6.2:1 there, and the pressed state becomes a fill rather than a tint.
   */
  onBand?: boolean
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const look = onBand
    ? (pressed === true
        ? "bg-white text-brand focus-visible:outline-white"
        : "text-white hover:bg-white/20 focus-visible:outline-white")
    : (pressed === true ? "text-accent hover:bg-surface-hover" : "text-ink-muted hover:bg-surface-hover hover:text-ink")
  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`inline-flex size-tap cursor-pointer items-center justify-center rounded ${look}`}
      {...rest}
    >
      <Icon name={name} className="text-base" />
    </button>
  )
}

/**
 * How a way out of a shortened box is drawn — whether it leads somewhere
 * (`MoreLink`) or opens the rest where it stands (`Clamped`).
 *
 * **An arrow rather than a rule under the words.** It is not a link in a
 * sentence but a way out of the box it closes, and it sits where a reader
 * looks for one: at the end of the line that names what they are looking at.
 * The words are small and set in the brand's weight, so that it reads as a
 * control on the heading rather than as another entry in the list — which is
 * also what it is at the foot of a cut-short cell, where it is a step smaller
 * than the entries above it.
 *
 * It never wraps: the arrow says the words belong to it, and a line break
 * between them leaves a chevron on a line of its own.
 *
 * **The two share the drawing because they answer the same question.** Written
 * apart, one cell of a listing said it in the brand's twelve with an arrow and
 * the cell four columns along said it in grey fourteen with nothing, and the
 * reader had no way to know that only one of them could be pressed.
 */
const MORE = "inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-brand text-xs"

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
 * way to undo and carries nothing. Folding one into the other would say the two
 * must always be set alike, which nobody has decided — and there is no third
 * place in the public screens spelling either of them out by hand, so the pair
 * is not a duplication anybody has to keep in step.
 */
export const CLEAR = "font-semibold text-brand text-xs"

/**
 * The way from a few of something to all of it — the five newest announcements
 * to the whole listing, a table's first page to the search behind it.
 */
export function MoreLink({ to, children }: { to: string, children: ReactNode }) {
  return (
    <Link to={to} className={MORE}>
      {children}
      <Icon name="chevron-right" aria-hidden="true" />
    </Link>
  )
}

/**
 * A condition in force, and the way to lift it.
 *
 * The whole chip is the link that removes it, so what is on the screen and what
 * can be undone are the same object.
 *
 * **What the condition is about and what it says are two segments.** Run
 * together as one string they read as a single long name, and a column of them
 * gives the eye nothing to line up on; split, the field names form a column and
 * the reader can see at a glance which dimensions are in force. The field is
 * the part that repeats, so it takes the tinted half.
 *
 * **It wraps rather than truncates.** These stand in a pane a quarter the width
 * of the page, and a condition cut off mid-value is a filter the reader cannot
 * read — which is the one thing a chip exists to prevent.
 */
export function Chip({ field, value, to, remove }: {
  /** The dimension the condition is about. Absent when it names none. */
  field?: string
  value: ReactNode
  to: string
  remove: string
}) {
  return (
    <Link
      to={to}
      // Lifting a condition leaves the reader where they were: what they are
      // watching is the listing this chip stands over, and it is still there
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
    <Marked
      box="border-warning bg-warning-surface"
      icon="warning"
      iconClass="text-warning"
      action={onDismiss === undefined
        ? undefined
        : <IconButton name="close" label={dismiss} onClick={onDismiss} />}
    >
      {children}
    </Marked>
  )
}

/* --------------------------------------------------------- header controls */

/**
 * The languages, as the row of round pills v1 puts at the top right.
 *
 * Both are always drawn, and the one being read is filled rather than removed:
 * the pair is what tells a reader the site has another language at all, and a
 * lone "English" says nothing about which one they are in now.
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
                className={`inline-flex size-7 items-center justify-center rounded-full font-semibold text-white text-xs ${BAND_FILL.brand}`}
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
export function RoundLink({ to, name, label, count, filled = false, external = false }: {
  to: string
  name: IconName
  label: string
  /** Drawn only when there is something to count. */
  count?: number
  filled?: boolean
  /** For an address no client-side navigation can answer, such as `/auth/login`. */
  external?: boolean
}) {
  const className = `relative inline-flex size-tap items-center justify-center rounded-full border no-underline ${
    filled
      ? `border-transparent text-white hover:brightness-90 ${BAND_FILL.brand}`
      : "border-line text-ink-muted hover:bg-surface-hover hover:text-ink"
  }`
  const inside = (
    <>
      <Icon name={name} className="text-base" />
      {count !== undefined && count > 0 && (
        <span className="-top-1 -right-1 absolute inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 font-semibold text-white text-xs">
          {count}
        </span>
      )}
    </>
  )
  return external
    ? <a href={to} aria-label={label} title={label} className={className}>{inside}</a>
    : <Link to={to} aria-label={label} title={label} className={className}>{inside}</Link>
}

/* ------------------------------------------------------------- breadcrumb */

/**
 * Where the page sits, from the front page down.
 *
 * The last entry is the page itself and is not a link — it names where the
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
 * Links, not a control: each tab is the address of the other listing carrying
 * the same search, so the choice is shareable and the browser's own history
 * holds it. The trapezoid is v1's, drawn with a skewed leading edge rather than
 * a background image, and sits at the top right of the box it belongs to.
 *
 * **The strip ends where the box ends.** A tab is the top edge of the box it
 * opens, so a gap on the right leaves it floating over the page instead — the
 * one thing that stops the pair reading as a folder.
 *
 * **A tab that is not the current one sits lower and is lit from inside**, and
 * the one that is stands a step above it and casts a shade upwards. Depth is
 * what the shape is for: two flat trapezoids side by side say which is filled
 * white but not which is in front, and the sloped edge then reads as a stray
 * corner. The tabs overlap for the same reason — the slope has to run *behind*
 * its neighbour to be an edge rather than a gap.
 *
 * **Nothing is outlined.** A face is told from the one behind it by what it is
 * filled with, which means the tab that is not being read must not be filled
 * with the page's own tint: with an edge drawn round it that looks like a tab,
 * and without one it is a hole. `surface-light` is that face — above the page,
 * below the white box.
 *
 * **The corners are the large ones because of that.** Three faces within a few
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
            // The leading edge: a skewed strip standing to the left of the tab,
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
            // order says (it is the only one of the two that is positioned), so
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
 * The tabs a long form is cut into.
 *
 * **Only the display is switched: every field stays in the document**, so one
 * save carries the whole form and nothing an editor typed can be lost by moving
 * between tabs. That is also why a tab has to be able to carry a mark — an
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
 * all and says nothing about why. Validate on the server, which is where the
 * rules are (`docs/editing.md`).
 */
export function SectionTabs({ label, tabs, current, onSelect }: {
  label: string
  tabs: { id: string, label: string, mark?: ReactNode }[]
  current: string
  onSelect: (id: string) => void
}) {
  const strip = useRef<HTMLDivElement>(null)

  function move(to: number) {
    const at = (to + tabs.length) % tabs.length
    const next = tabs[at]
    if (next === undefined) return
    onSelect(next.id)
    strip.current?.querySelector<HTMLButtonElement>(`#tab-${CSS.escape(next.id)}`)?.focus()
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
      className="flex flex-wrap items-end border-line border-b"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={tab.id === current}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={tab.id === current ? 0 : -1}
          onClick={() => { onSelect(tab.id) }}
          className={`-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-4 py-2 text-sm ${
            tab.id === current
              ? "border-brand font-semibold text-brand"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
          {tab.mark}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ id, current, children }: {
  id: string
  current: string
  children: ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={id !== current}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------- folding and lists */

/**
 * A part of a panel that can be folded away.
 *
 * A `<details>` rather than a control, so folding costs no script and no state
 * of its own, and the browser tells assistive software whether it is open.
 * **What is open is decided by the caller, and a section holding a chosen value
 * is always open** — a condition in force that cannot be seen is a listing that
 * lies about itself.
 */
export function Fold({ summary, note, open = false, children }: {
  summary: ReactNode
  /** What the section is worth glancing at while closed. */
  note?: ReactNode
  open?: boolean
  children: ReactNode
}) {
  // No rule of its own: a column of these wants one between them, which the
  // column draws (`divide-y`), and a single one on a page wants none at all —
  // a lone rule under one fold reads as the bottom of something.
  return (
    <details open={open} className="group py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-sm marker:content-none">
        <span className="flex items-center gap-1.5">
          <Icon name="chevron-right" className="text-ink-muted transition-transform group-open:rotate-90" />
          {summary}
        </span>
        {note !== undefined && <span className="text-ink-muted text-xs">{note}</span>}
      </summary>
      <div className="mt-2 pl-5">{children}</div>
    </details>
  )
}

/**
 * A list cut to a few entries, with the rest behind the count of them.
 *
 * **The rest open where they were cut.** A cell in a listing sits on a row the
 * reader is holding against the rows above and below it, and a link that took
 * them to another page to read three more accessions would cost them the
 * comparison they opened the listing for. So the count is a control rather than
 * a link, and what it reveals arrives in the same cell.
 *
 * **What opens has a ceiling.** The largest research has over two hundred
 * datasets, and a row grown to hold them would push everything under it off the
 * screen; past the ceiling the list scrolls where it stands, so the page below
 * moves by at most one screenful however long the list is.
 */
export function Clamped({ items, shown = 3, more, less }: {
  items: ReactNode[]
  shown?: number
  /** What the rest are called, given how many there are. */
  more: (rest: number) => ReactNode
  /** What the control says once the rest are showing. */
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
      <ul className={open ? "max-h-72 overflow-y-auto" : undefined}>
        {(open || !cut ? items : items.slice(0, shown)).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      {cut && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => { setOpen(!open) }}
          className={`${MORE} cursor-pointer`}
        >
          {open ? less : more(rest)}
          {/* Turned to point back the way it came, so that the one drawing says
              both "there is more this way" and "put it back". */}
          <Icon name="chevron-right" aria-hidden="true" className={open ? "-rotate-90" : ""} />
        </button>
      )}
    </>
  )
}

/**
 * A cell's worth of prose, cut to a few lines with the rest a press away.
 *
 * **Cut, not scrolled.** A box that scrolls inside a table row asks the reader
 * to find a second bar inside the one they are already using, and on a page of
 * twenty research rows fourteen of them appear at once. What is shown fades
 * into the row instead, which says there is more without asking for anything;
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
  /** What the control says while the rest are hidden. */
  more: ReactNode
  /** What it says once they are showing. */
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
    // tall as its contents, and asking whether it overflows would answer no and
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
          className={`${MORE} cursor-pointer`}
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

/* ------------------------------------------------------------------ notes */

/**
 * A remark set apart from the text around it.
 *
 * White with a thin coloured edge, which is how v1 draws the one it uses on the
 * public pages. The four kinds are the ones the old articles were written with,
 * and the markdown that came from them still names them.
 */
export type NoteKind = "plain" | "info" | "tip" | "warning" | "danger" | "done"

export const NOTE_KIND: Record<NoteKind, { icon: IconName | null, className: string }> = {
  /**
   * The quietest one, and the only one without a glyph: an aside that needs
   * setting apart from the paragraphs and says nothing about urgency. It is
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

export function Note({ kind = "info", live = false, children }: {
  kind?: NoteKind
  /**
   * Whether this appeared in answer to something the reader did. A save that
   * replies on the same page is otherwise silent to anybody not watching that
   * corner of the screen.
   */
  live?: boolean
  children: ReactNode
}) {
  const { icon, className } = NOTE_KIND[kind]
  return (
    <Marked box={`bg-white ${className}`} icon={icon} live={live}>
      {children}
    </Marked>
  )
}

/* --------------------------------------------------------- asking and busy */

/**
 * Something that cannot be undone, asked about in place.
 *
 * **The confirmation is the form**, not a layer over the page: a dialogue has to
 * be dismissed, moved around and given focus, and all it would add here is that
 * the reader can no longer see what they are about to act on.
 */
export function Confirm({ label, warning, confirm, cancel, children }: {
  label: string
  warning: string
  confirm: string
  cancel: string
  /** The hidden fields naming what is being acted on. */
  children?: ReactNode
}) {
  const [asking, setAsking] = useState(false)

  if (!asking) {
    return (
      <Button type="button" variant="ghost" onClick={() => { setAsking(true) }}>
        {label}
      </Button>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      {children}
      <span className="text-danger text-sm">{warning}</span>
      <Button type="submit" variant="danger" icon={<Icon name="trash" />}>{confirm}</Button>
      <Button type="button" variant="ghost" onClick={() => { setAsking(false) }}>{cancel}</Button>
    </span>
  )
}

/** The panel a menu opens. */
const MENU_PANEL
  = "min-w-max flex-col items-stretch border border-line bg-white py-1 shadow-lg"

/**
 * One line inside it. **Exported because the lines are the caller's** — the
 * navigation puts links in its menu and the account puts a name, a link and a
 * form, and the panel has no way to wrap what it is given without deciding
 * which of those it is.
 */
export const MENU_ITEM
  = "block whitespace-nowrap px-4 py-2 text-sm no-underline hover:bg-surface-hover"

/**
 * The same line when it names where the reader already is. Written out whole
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
 * A set of actions that would crowd the row they belong to.
 *
 * A `<details>`, so what it holds is in the markup and its own control opens it.
 *
 * **It closes on Escape, on a press anywhere else, and on going somewhere.** A
 * panel that only closes by pressing the same control again stays open over the
 * page while the reader goes on doing something else — and the one in the bar
 * covers the top right corner of every screen. The two listeners are on the
 * document because the press that should close it is by definition not on this
 * element; they are attached once and do nothing while it is shut. **Choosing
 * an entry does not reload the page**, so arriving somewhere has to close it
 * too, which is what the address is watched for.
 */
export function Menu({ label, icon = "more", round = false, word = false, value, corner = "all", children }: {
  label: string
  icon?: IconName
  /** In the top bar, where the controls on either side of it are circles. */
  round?: boolean
  /**
   * Whether the name is drawn beside the glyph.
   *
   * **The navigation's own menu says what it is.** A glyph alone is read as
   * "more of what I am looking at" — which is what it means everywhere else on
   * the site — and the one in the bar holds destinations rather than actions.
   */
  word?: boolean
  /**
   * What is chosen now, when the menu is a choice rather than a set of actions.
   *
   * The control then draws that value and a caret instead of a glyph, and
   * **the edge around it belongs to `Chooser`** — a choice is read against the
   * word saying what it chooses, and the two have to sit in one box.
   */
  value?: string
  /** Which corners the control rounds, since `Chooser` may weld one to it. */
  corner?: keyof typeof MENU_CORNER
  children: ReactNode
}) {
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
    // Focus goes back to the control that opened it: closing a panel the
    // reader is inside would otherwise leave focus on nothing.
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

  return (
    <details ref={box} className="relative inline-block">
      <summary
        aria-label={word ? undefined : label}
        title={word ? undefined : label}
        className={`inline-flex cursor-pointer list-none items-center justify-center gap-1.5 marker:content-none hover:bg-surface-hover ${
          value !== undefined
            // A control naming a choice is a step shallower than a button, and a
            // step narrower on the side the caret is (`docs/ui.md`): the row it
            // shares already stands 36px squares in it, and a caret carries
            // whitespace of its own the way a letter does not.
            ? `whitespace-nowrap py-1 pr-2 pl-3 text-sm ${MENU_CORNER[corner]}`
            : `min-h-tap text-ink-muted hover:text-ink ${word ? "whitespace-nowrap rounded px-2 font-medium text-ink text-sm" : round ? "size-tap rounded-full border border-line" : "size-tap rounded"}`
        }`}
      >
        {value === undefined && <Icon name={icon} className="text-base" />}
        {value}
        {word && label}
        {value !== undefined && <Icon name="chevron-down" aria-hidden="true" />}
      </summary>
      <div className={`absolute right-0 z-20 mt-2 flex ${MENU_PANEL}`}>
        {children}
      </div>
    </details>
  )
}

/**
 * A control that names what is chosen now and opens the alternatives.
 *
 * **The word saying what is being chosen stays outside the control.** "並び替え"
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
 * its own is 36px square everywhere else (`docs/ui.md`), but this one shares an
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
