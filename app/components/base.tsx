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
 * They differ in colour and in what they are for; the shape is one shape. Three
 * of them used to be written out separately and had drifted apart in padding,
 * in the gap, in the corner and in how the glyph was aligned.
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
  brand: "bg-linear-to-r from-brand to-brand-light",
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
  icon,
  className = "",
  children,
}: ButtonLook & { to: string, external?: boolean, newTab?: boolean, children: ReactNode }) {
  const shape = buttonClass(variant, size, pill, className)
  const inside = (
    <>
      {icon}
      {children}
    </>
  )
  if (!external) return <Link to={to} className={shape}>{inside}</Link>
  // A new tab is only ever opened where the words say so, and `noreferrer`
  // keeps the address of the page that opened it out of the other site's log.
  return newTab
    ? <a href={to} target="_blank" rel="noreferrer" className={shape}>{inside}</a>
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

export function BigAction({ to, tone, icon, external = false, children }: {
  to: string
  tone: "accent" | "brand"
  icon: IconName
  /** Leaves the site — the application system, the submission navigator. */
  external?: boolean
  children: ReactNode
}) {
  const shape = `flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg px-6 py-4 text-center font-bold text-lg text-white no-underline visited:text-white hover:brightness-95 ${WAY_IN_FILL[tone]}`
  const inside = (
    <>
      <Icon name={icon} className="text-2xl" />
      <span className="flex items-center gap-2">
        {children}
        {external && <Icon name="external" />}
      </span>
    </>
  )
  return external
    ? <a href={to} target="_blank" rel="noreferrer" className={shape}>{inside}</a>
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
 * The way from a few of something to all of it — the five newest announcements
 * to the whole listing, a table's first page to the search behind it.
 *
 * **An arrow rather than a rule under the words.** It is not a link in a
 * sentence but a way out of the box it closes, and it sits where a reader
 * looks for one: at the end of the line that names what they are looking at.
 * The words are small and set in the brand's weight, so that it reads as a
 * control on the heading rather than as another entry in the list — which is
 * also what it is at the foot of a cut-short cell (`Clamped`), where it is a
 * step smaller than the entries above it.
 *
 * It never wraps: the arrow says the words belong to it, and a line break
 * between them leaves a chevron on a line of its own.
 */
export function MoreLink({ to, children }: { to: string, children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-brand text-xs"
    >
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
 */
export function Chip({ label, to, remove }: { label: ReactNode, to: string, remove: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 rounded-full border border-brand bg-white px-3 py-1 text-brand text-sm no-underline hover:bg-surface-hover"
    >
      {label}
      <Icon name="close" aria-hidden="true" />
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
 */
export function SwitchTabs({ label, tabs }: {
  label: string
  tabs: { label: string, to: string, current: boolean }[]
}) {
  return (
    <nav aria-label={label} className="-mb-px flex items-end justify-end pr-4">
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.current ? "page" : undefined}
          className={[
            "relative ml-3.5 flex items-end rounded-tr border-line border-t border-r px-6 pb-1.5 font-bold text-sm no-underline",
            // The leading edge: a skewed strip standing to the left of the tab,
            // which makes the left side a slope and the right side upright.
            "before:absolute before:top-[-1px] before:bottom-0 before:-left-3.5 before:w-3.5",
            "before:origin-bottom-right before:-skew-x-[25deg] before:rounded-tl before:border-line before:border-t before:border-l before:content-['']",
            tab.current
              ? "z-10 border-b border-b-white bg-white pt-2 text-brand before:border-b before:border-b-white before:bg-white"
              : "z-0 border-b bg-surface pt-1.5 text-ink-muted hover:bg-surface-hover before:border-b before:border-line before:bg-surface hover:before:bg-surface-hover",
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
 * A list cut to a few entries, with the rest a click away.
 *
 * **The cut is in the markup, not in a scroll box**: a cell in a listing may
 * hold sixty accessions, and a row that grew to sixty lines would push every
 * other row off the screen.
 */
export function Clamped({ items, shown = 3, more, children }: {
  items: ReactNode[]
  shown?: number
  /** What the rest are called, given how many there are. */
  more: (rest: number) => ReactNode
  /** Where the rest can be read. Without one, the count is plain text. */
  children?: ReactNode
}) {
  const rest = items.length - shown
  return (
    <ul>
      {items.slice(0, shown).map((item, index) => <li key={index}>{item}</li>)}
      {rest > 0 && (
        <li className="text-ink-muted text-sm">
          {children ?? more(rest)}
        </li>
      )}
    </ul>
  )
}

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
export function Menu({ label, icon = "more", round = false, word = false, children }: {
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
        className={`inline-flex min-h-tap cursor-pointer list-none items-center justify-center gap-1.5 text-ink-muted marker:content-none hover:bg-surface-hover hover:text-ink ${
          word ? "whitespace-nowrap rounded px-2 font-medium text-ink text-sm" : round ? "size-tap rounded-full border border-line" : "size-tap rounded"
        }`}
      >
        <Icon name={icon} className="text-base" />
        {word && label}
      </summary>
      <div className={`absolute right-0 z-20 mt-2 flex ${MENU_PANEL}`}>
        {children}
      </div>
    </details>
  )
}

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
