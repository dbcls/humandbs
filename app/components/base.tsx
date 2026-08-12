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

import { useId, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router"

import { Icon, type IconName } from "~/components/icons"

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
 */
export function Heading({ level = "h1", title, count, children }: {
  level?: "h1" | "h2"
  title: string
  count?: string
  children?: ReactNode
}) {
  const Tag = level
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <div className="flex items-baseline gap-3 border-brand border-l-6 pl-3">
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

export function Badge({ tone = "muted", onBand = false, pill = false, icon, children }: {
  tone?: Tone
  /** A badge sitting on a band, where white is the badge rather than the page. */
  onBand?: boolean
  /** Fully rounded, which is the shape v1 gives the ones that lead somewhere. */
  pill?: boolean
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-nowrap border px-2 py-0.5 text-xs ${
        pill ? "rounded-full" : "rounded-sm"
      } ${onBand ? "border-white/70 text-white" : `bg-white ${BADGE_TONE[tone]}`}`}
    >
      {icon}
      {children}
    </span>
  )
}

/** A state that is worth a mark but not a word, beside the thing it is about. */
export function Dot({ tone = "warning", label }: { tone?: Tone, label: string }) {
  const fill: Record<Tone, string> = {
    brand: "bg-brand",
    accent: "bg-accent",
    muted: "bg-line-strong",
    warning: "bg-warning",
    danger: "bg-danger",
  }
  return (
    <span className={`inline-block size-2 rounded-full align-middle ${fill[tone]}`}>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/* ---------------------------------------------------------------- buttons */

/**
 * What a control looks like, by what pressing it does.
 *
 * `primary` is the one thing the screen wants done, and there is at most one on
 * a screen. `danger` is reserved for what cannot be undone — unpublishing,
 * deleting, discarding a draft — so that its colour keeps meaning something.
 *
 * `pill` is the outlined, fully rounded shape v1 gives the controls over a
 * listing (copy, export, refine). It is a shape rather than a rank, so it
 * combines with any variant.
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost"

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-white hover:brightness-90",
  accent: "border-transparent bg-accent text-white hover:brightness-90",
  secondary: "border-brand bg-white text-brand hover:bg-surface-hover",
  danger: "border-danger bg-white text-danger hover:bg-danger hover:text-white",
  ghost: "border-transparent bg-transparent text-brand hover:bg-surface-hover",
}

const BUTTON_SIZE = {
  /** Beside a value in a panel or a row, where the control is not the subject. */
  xs: "gap-1 px-2 py-0.5 text-xs",
  sm: "gap-1 px-3 py-1 text-sm",
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
 * The front page offers exactly two: provide data, or use it. They are the same
 * gradients as the bands and they are the only place a filled block of colour is
 * this large — which is what makes them read as the way in rather than as two
 * more links (v1 does the same, at the same size).
 */
export function BigAction({ to, tone, icon, external = false, children }: {
  to: string
  tone: "accent" | "brand"
  icon: IconName
  /** Leaves the site — the application system, the submission navigator. */
  external?: boolean
  children: ReactNode
}) {
  const shape = `flex min-h-20 items-center justify-center gap-3 rounded px-8 py-5 text-center font-bold text-lg text-white no-underline visited:text-white hover:brightness-95 ${BAND_FILL[tone]}`
  const inside = (
    <>
      <Icon name={icon} className="text-2xl" />
      {children}
      {external && <Icon name="external" />}
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
      className={`inline-flex cursor-pointer items-center justify-center rounded p-1 ${look}`}
      {...rest}
    >
      <Icon name={name} className="text-base" />
    </button>
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
      className="inline-flex items-center gap-1 rounded-full border border-brand bg-white px-3 py-0.5 text-brand text-sm no-underline hover:bg-surface-hover"
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
    <div className="flex items-start gap-2 rounded-sm border border-warning bg-warning-surface px-3 py-1.5">
      <Icon name="warning" className="mt-0.5 shrink-0 text-base text-warning" />
      {/* Small, because there may be three of these above the page and the
          reader came for what is under them. */}
      <div className="min-w-0 flex-1 text-xs leading-relaxed">{children}</div>
      {onDismiss !== undefined && <IconButton name="close" label={dismiss} onClick={onDismiss} />}
    </div>
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
    <nav aria-label={label} className="flex items-center gap-1">
      {options.map((option) => (
        option.current
          ? (
              <span
                key={option.code}
                aria-current="true"
                className="inline-flex size-8 items-center justify-center rounded-full bg-brand font-semibold text-white text-xs"
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
                className="inline-flex size-8 items-center justify-center rounded-full font-semibold text-ink-muted text-xs no-underline hover:bg-surface-hover"
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
  const className = `relative inline-flex size-9 items-center justify-center rounded-full border no-underline ${
    filled
      ? "border-transparent bg-brand text-white hover:brightness-90"
      : "border-line text-ink-muted hover:bg-surface-hover hover:text-ink"
  }`
  const inside = (
    <>
      <Icon name={name} className="text-base" />
      {count !== undefined && count > 0 && (
        <span className="-top-1 -right-1 absolute inline-flex min-w-4 items-center justify-center rounded-full bg-accent px-1 font-semibold text-[10px] text-white">
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
  return (
    <details open={open} className="group border-line border-b py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-sm marker:content-none">
        <span className="flex items-center gap-1.5">
          <Icon name="chevron-right" className="text-ink-muted transition-transform group-open:rotate-90" />
          {summary}
        </span>
        {note !== undefined && <span className="text-ink-muted text-xs">{note}</span>}
      </summary>
      <div className="mt-1 pl-5">{children}</div>
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
        <li className="text-ink-muted text-xs">
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
export type NoteKind = "info" | "tip" | "warning" | "danger"

const NOTE_KIND: Record<NoteKind, { icon: IconName, className: string }> = {
  info: { icon: "info", className: "border-brand text-brand" },
  tip: { icon: "tip", className: "border-ink-muted text-ink-muted" },
  warning: { icon: "warning", className: "border-warning text-warning" },
  danger: { icon: "alert", className: "border-danger text-danger" },
}

export function Note({ kind = "info", children }: { kind?: NoteKind, children: ReactNode }) {
  const { icon, className } = NOTE_KIND[kind]
  return (
    <div className={`flex gap-3 rounded border bg-white px-4 py-3 text-sm ${className}`}>
      <Icon name={icon} className="mt-0.5 text-base" />
      <div className="min-w-0 text-ink">{children}</div>
    </div>
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

/**
 * A set of actions that would crowd the row they belong to.
 *
 * A `<details>` again, so the menu opens without script. It closes on choosing
 * because choosing navigates or submits.
 */
export function Menu({ label, icon = "more", round = false, children }: {
  label: string
  icon?: IconName
  /** In the top bar, where the controls on either side of it are circles. */
  round?: boolean
  children: ReactNode
}) {
  return (
    <details className="relative inline-block">
      <summary
        aria-label={label}
        title={label}
        className={`inline-flex cursor-pointer list-none items-center justify-center text-ink-muted marker:content-none hover:bg-surface-hover hover:text-ink ${
          round ? "size-9 rounded-full border border-line" : "rounded p-1"
        }`}
      >
        <Icon name={icon} className="text-base" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-max flex-col items-stretch border border-line bg-white py-1 shadow-lg">
        {children}
      </div>
    </details>
  )
}

/** Work in progress, named so that it is not only a moving shape. */
export function Busy({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-muted text-sm">
      <Icon name="spinner" className="animate-spin text-base" />
      {label}
    </span>
  )
}

/** How far something has got, for the one operation that takes long enough: an upload. */
export function Progress({ label, done, total }: { label: string, done: number, total: number }) {
  const id = useId()
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink-muted text-xs">{label}</label>
      <progress id={id} value={done} max={total} className="h-2 w-full">
        {percent}
        %
      </progress>
    </div>
  )
}
