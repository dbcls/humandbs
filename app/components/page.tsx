import { createContext, Fragment, useContext, type ReactNode } from "react"
import { Link } from "react-router"

import { Badge, Band, BAND_FILL, type BandTone, Breadcrumb, Note, Stack } from "~/components/base"
import { Icon } from "~/components/icons"
import { linkHref } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import type { FieldView, LinksView, TermView } from "~/public/view.server"

/**
 * What a preview hangs beside a place the page draws — a comment mark, a note
 * that the published version says something else.
 *
 * A page marks its places by putting `<Annotation at="…" />` where the mark
 * belongs, and the anchor it names is the same path a comment is attached by
 * and the diff reports. **A public page provides nothing**, so `annotate` is
 * absent, every mark renders as nothing, and the published page is drawn by the
 * same code that draws the preview.
 */
export type Annotate = (at: string) => ReactNode

const AnnotateContext = createContext<Annotate | null>(null)

export function AnnotationLayer({ annotate, children }: {
  annotate: Annotate
  children: ReactNode
}) {
  return <AnnotateContext.Provider value={annotate}>{children}</AnnotateContext.Provider>
}

export function Annotation({ at }: { at: string }) {
  const annotate = useContext(AnnotateContext)
  return annotate === null ? null : <>{annotate(at)}</>
}

/**
 * The area a screen draws in.
 *
 * **An article asks for the narrower measure.** A listing wants every column it
 * can get, but a page that is mostly prose — a guideline, a news item, the four
 * pages the code holds — is held to the reading width, which is what v1 does
 * with the same two numbers (`app.css`).
 */
export function Page({ width = "wide", children }: {
  width?: "wide" | "reading"
  children: ReactNode
}) {
  // The target of the skip link in the header, on every page that has one.
  return (
    <main
      id="content"
      className={`mx-auto w-full px-4 py-8 sm:px-page-gutter ${
        width === "reading" ? "max-w-content-narrow" : "max-w-content-max"
      }`}
    >
      {children}
    </main>
  )
}

/**
 * Where the page sits, said above it.
 *
 * The front page is always the first step and is added here rather than by
 * every screen, so a trail is written as what lies between the front page and
 * this one. It sits on the tint above the white box, which is where v1 puts it.
 * The front page itself has none: it is the root, and a trail of one step
 * naming the page you are on says nothing.
 */
export function Crumbs({ locale, trail = [], current }: {
  locale: Locale
  trail?: { label: string, to: string }[]
  current: string
}) {
  const messages = messagesFor(locale)
  return (
    <div className="mb-2">
      <Breadcrumb
        label={messages.breadcrumb}
        trail={[{ label: messages.homeLabel, to: href(locale, "/") }, ...trail]}
        current={current}
      />
    </div>
  )
}

/**
 * The band a page opens with, and what sits next to it.
 *
 * **Only a page about one thing that has a name of its own gets one** — a
 * research, a dataset, a draft (`base.tsx` の `Band`). A listing or an article
 * opens with `Heading` instead. The subject's own label goes above the name it
 * is known by, the way v1 puts "NBDC Research ID:" over `hum0103-v4`.
 */
export function PageHead({ tone = "deep", kicker, label, children }: {
  tone?: BandTone
  /** What kind of name this is, said small above it. */
  kicker?: string
  label: ReactNode
  children?: ReactNode
}) {
  return (
    <Band tone={tone} className="rounded-t">
      <div>
        {kicker !== undefined && <p className="text-white/80 text-xs">{kicker}</p>}
        <h1 className="flex flex-wrap items-center gap-3 font-bold text-xl">{label}</h1>
      </div>
      {children !== undefined && (
        <div className="flex flex-wrap items-center gap-3 text-sm">{children}</div>
      )}
    </Band>
  )
}

/**
 * The white box a screen puts its content in.
 *
 * No border and no shadow: the page sits on a tint, so the edge of the box is
 * where the tint stops. `under` squares off the top, for a box that follows a
 * band and is one thing with it.
 */
export function Card({ under = true, fill = false, children }: {
  under?: boolean
  /**
   * Whether the box takes the height of the column it stands in. A page in two
   * columns whose contents are of different lengths otherwise ends with one
   * side stopping short and the background showing through beside it.
   */
  fill?: boolean
  children: ReactNode
}) {
  return (
    <div className={`bg-white px-6 py-6 ${under ? "rounded-b" : "rounded"} ${fill ? "h-full" : ""}`}>
      {children}
    </div>
  )
}

/**
 * A part of a page, named. No rule under it — the space is the separation.
 *
 * The distance to whatever is above is the `Stack` these sit in rather than a
 * margin of their own: two rules for one gap is how a page ends up with an
 * uneven one.
 */
export function Section({ title, at, children }: {
  title: string
  /** The anchor of the whole section, when it draws one field. */
  at?: string
  children: ReactNode
}) {
  return (
    <Stack gap="tight" as="section">
      {/* A mark for the whole section sits beside its name rather than under
          it: on a line of its own it reads as belonging to the first value. */}
      <h2 className="flex flex-wrap items-center gap-2 font-semibold text-brand text-lg">
        {title}
        {at !== undefined && <Annotation at={at} />}
      </h2>
      {children}
    </Stack>
  )
}

/**
 * One labelled value.
 *
 * The label is set above the value and each pair is closed by a rule, which is
 * how v1 draws the descriptive half of a research page.
 *
 * **The pairs are laid out on a grid rather than flowed into columns.** Flowed
 * columns break wherever the height happens to fall, so the rules on the left
 * and the rules on the right line up nowhere and the last column ends short —
 * three values under a heading left a quarter of the box empty. On a grid the
 * rules meet across the page and the rows read as rows.
 */
export function Pairs({ children }: { children: ReactNode }) {
  // `items-start` because the rule under a value has to sit under *that* value:
  // stretched to the height of its row, the rule below a one-line answer would
  // be drawn eight lines under it, beside a long one in the other column.
  return <dl className="grid items-start gap-x-8 sm:grid-cols-2">{children}</dl>
}

export function KeyValue({ title, at, children }: {
  title: string
  /** The anchor of the value below, when the page has one for it. */
  at?: string
  children: ReactNode
}) {
  return (
    <div className="border-line border-b py-2">
      <Stack gap="tight">
        <dt className="text-ink-muted text-xs">{title}</dt>
        <dd>
          {children}
          {at !== undefined && <Annotation at={at} />}
        </dd>
      </Stack>
    </div>
  )
}

/**
 * A table.
 *
 * **A header is anything, not a string.** A column whose header is a control —
 * the checkbox that selects every file, a sort link — cannot be written
 * otherwise, and a table that took only strings pushed those columns into
 * having no header at all.
 *
 * **The table is allowed to be wider than the page** and scrolls inside its own
 * box. A cell has a floor as well as a ceiling: without the floor a narrow
 * screen squeezes a column of titles down to one character per line rather than
 * letting the table overflow, and without the ceiling one long summary makes
 * every other column unreadably narrow.
 */
export function Table({ headers, children }: { headers: ReactNode[], children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto border-collapse text-sm">
        <thead>
          <tr className={`text-left text-white ${BAND_FILL.brand}`}>
            {/*
              A header asks for no width of its own: what a column needs is
              decided by the cells under it, and a header that claimed a floor
              would widen a column of marks to the width of the word above it.
            */}
            {headers.map((header, index) => (
              <th key={index} className="max-w-88 px-3 py-2 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, nowrap = false, narrow = false, colSpan, className = "" }: {
  children?: ReactNode
  /** For a cell holding an identifier, which must not be broken to fit. */
  nowrap?: boolean
  /** For a cell holding a mark rather than a value, which needs no floor. */
  narrow?: boolean
  /** For a row that says one thing across several columns. */
  colSpan?: number
  className?: string
}) {
  return (
    <td
      colSpan={colSpan}
      className={`max-w-88 border-line border-b px-3 py-2 align-top ${narrow ? "" : "min-w-28"} ${nowrap ? "whitespace-nowrap" : ""} ${className}`}
    >
      {children}
    </td>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted text-sm">{children}</p>
}

/**
 * Page links, given a way to address a page.
 *
 * **The cut is always made on the server**, both for search results and for a
 * box of ten thousand files, so what a reader gets is a link rather than a
 * script — and one address for one page, which can be shared.
 */
const PAGE_STEP = "inline-flex min-h-tap min-w-tap items-center justify-center rounded px-2 hover:bg-surface-hover"

export function PageLinks({ label, page, pageCount, at, previous, next }: {
  label: string
  page: number
  pageCount: number
  at: (page: number) => string
  previous: string
  next: string
}) {
  if (pageCount <= 1) return null
  const window = [...new Set([
    1,
    ...[page - 2, page - 1, page, page + 1, page + 2].filter((n) => n > 1 && n < pageCount),
    pageCount,
  ])].sort((a, b) => a - b)

  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1 text-sm">
      {page > 1 && <Link to={at(page - 1)} className={PAGE_STEP}>{previous}</Link>}
      {window.map((number, index) => (
        <span key={number} className="flex items-center gap-1">
          {index > 0 && (window[index - 1] ?? 0) < number - 1 && (
            <span className="text-ink-muted" aria-hidden="true">…</span>
          )}
          {/*
            A page number is a two-character target. Without a box around it the
            thing to press is the glyph itself, which is a tenth of the area of
            anything else on the page that can be pressed.
          */}
          {number === page
            ? (
                <span className={`${PAGE_STEP} font-semibold`} aria-current="page">
                  {number}
                </span>
              )
            : <Link to={at(number)} className={PAGE_STEP}>{number}</Link>}
        </span>
      ))}
      {page < pageCount && <Link to={at(page + 1)} className={PAGE_STEP}>{next}</Link>}
    </nav>
  )
}

/**
 * A run of prose. A span is a link only if its destination is one the page may
 * follow — everything else keeps its text and loses the link, so a `javascript:`
 * URL written into a value cannot become an anchor on the portal's own origin.
 * This is the last of the two checks; the save path is the other.
 */
function SpanText({ span }: { span: Span }) {
  const href = span.href === undefined ? null : linkHref(span.href)
  return href === null ? <>{span.text}</> : <a href={href}>{span.text}</a>
}

/** Lines of spans, and nothing else — the whole of what prose can hold. */
function Prose({ text }: { text: RichText }) {
  return (
    <>
      {text.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {line.map((span, spanIndex) => <SpanText key={spanIndex} span={span} />)}
        </Fragment>
      ))}
    </>
  )
}

/**
 * One resolved value. `not-applicable` is settled information, so it is shown
 * as a value rather than hidden — an empty value and "there is no such value"
 * are different answers, and only one of them means somebody still has to act.
 *
 * `unsettled` only ever arrives from a preview, and it is drawn as the empty
 * frame it is: the question is what the reader is being shown, and a blank
 * would look like a value nobody thought worth filling in.
 */
export function Value({ field, locale }: { field: FieldView, locale: Locale }) {
  if (field.state === "not-applicable") {
    return <span className="text-ink-muted italic">{messagesFor(locale).notApplicable}</span>
  }
  if (field.state === "unsettled") {
    return <Badge tone="accent" dashed>{messagesFor(locale).unsettled}</Badge>
  }
  if (field.state === "rich") {
    return field.text.length === 0 ? null : <Prose text={field.text} />
  }
  return field.text === "" ? null : <>{field.text}</>
}

/**
 * The same four states for a value that is a list of links. A URL never falls
 * back between languages, but it is marked unsettled and not applicable like
 * anything else, and a preview is where those two have to stay visible.
 */
/** Whether a links value has anything to draw, state included. */
export function hasLinks(links: LinksView): boolean {
  return links.state !== "value" || links.value.length > 0
}

export function LinksValue({ links, locale, linked = true }: {
  links: LinksView
  locale: Locale
  /** A preview shows a private file's address as text; everywhere else it is a link. */
  linked?: boolean
}) {
  if (links.state !== "value") return <Value field={links} locale={locale} />
  if (links.value.length === 0) return null
  return (
    <ul>
      {links.value.map((link) => (
        <li key={link.id} className="break-all">
          {linked
            ? <a href={link.url} target="_blank" rel="noreferrer">{link.text === "" ? link.url : link.text}</a>
            : (link.text === "" ? link.url : link.text)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Shown once for the whole page rather than beside each value: a page whose
 * language was never filled in has every field falling back, and a badge on
 * each of them would say the same thing dozens of times.
 */
export function UntranslatedNotice({ show, locale }: { show: boolean, locale: Locale }) {
  if (!show) return null
  return <Note kind="tip">{messagesFor(locale).untranslatedNotice}</Note>
}

/**
 * How a dataset may be used, which is the one thing a reader scanning a listing
 * is looking for.
 *
 * **A lock and the words, not a badge.** The restriction is a property of the
 * dataset rather than a state it is passing through, and forty outlined boxes
 * down a listing read as decoration; v1 draws it the same way. The lock is on
 * the restricted kinds only — an icon on every row would say nothing, and the
 * difference is the whole point.
 */
const RESTRICTED = new Set(["controlled-access-type-1", "controlled-access-type-2"])

export function AccessTypeBadge({ term }: { term: TermView }) {
  const restricted = RESTRICTED.has(term.code)
  return (
    <span className="inline-flex items-center gap-1.5 text-nowrap">
      {restricted && <Icon name="lock" className="text-accent" />}
      {term.label}
    </span>
  )
}
