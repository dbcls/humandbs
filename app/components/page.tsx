import { createContext, Fragment, useContext, type ReactNode } from "react"
import { Link } from "react-router"

import { Band, BAND_FILL, type BandTone } from "~/components/base"
import { Icon } from "~/components/icons"
import { linkHref } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
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

export function Page({ children }: { children: ReactNode }) {
  // The target of the skip link in the header, on every page that has one.
  return <main id="content" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
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
export function Card({ under = true, children }: { under?: boolean, children: ReactNode }) {
  return (
    <div className={`bg-white px-5 py-6 ${under ? "rounded-b" : "rounded"}`}>{children}</div>
  )
}

/** A part of a page, named. No rule under it — the space is the separation. */
export function Section({ title, at, children }: {
  title: string
  /** The anchor of the whole section, when it draws one field. */
  at?: string
  children: ReactNode
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 font-semibold text-brand text-lg">{title}</h2>
      {at !== undefined && <Annotation at={at} />}
      {children}
    </section>
  )
}

/**
 * One labelled value.
 *
 * The label is set in the brand colour above the value and each pair is closed
 * by a rule, which is how v1 draws the descriptive half of a research page. In
 * two columns the rules line the page into rows without a table having to.
 */
export function KeyValue({ title, at, children }: {
  title: string
  /** The anchor of the value below, when the page has one for it. */
  at?: string
  children: ReactNode
}) {
  return (
    <div className="break-inside-avoid border-line border-b py-2">
      <dt className="text-ink-muted text-xs">{title}</dt>
      <dd className="mt-1">
        {children}
        {at !== undefined && <Annotation at={at} />}
      </dd>
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
            {headers.map((header, index) => (
              <th key={index} className="min-w-28 max-w-88 px-3 py-2 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/**
 * A column header that also orders the table by its column.
 *
 * A link, so the ordering is in the address and can be shared, and so the table
 * needs no script to be sorted. The glyph says the column can be ordered; which
 * way it is ordered now is said in words, because two chevrons at 40% opacity is
 * not a difference everybody can see.
 */
export function SortHeader({ label, to, direction, ascending, descending }: {
  label: string
  to: string
  /** How this column is ordered now, or null if the table is ordered by another. */
  direction: "asc" | "desc" | null
  ascending: string
  descending: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 text-white no-underline hover:underline"
      aria-sort={direction === null ? undefined : direction === "asc" ? "ascending" : "descending"}
    >
      {label}
      <Icon name={direction === null ? "sort" : direction === "asc" ? "chevron-up" : "chevron-down"} />
      {direction !== null && (
        <span className="sr-only">{direction === "asc" ? ascending : descending}</span>
      )}
    </Link>
  )
}

export function Td({ children, nowrap = false, className = "" }: {
  children?: ReactNode
  /** For a cell holding an identifier, which must not be broken to fit. */
  nowrap?: boolean
  className?: string
}) {
  return (
    <td
      className={`min-w-28 max-w-88 border-line border-b px-3 py-2 align-top ${nowrap ? "whitespace-nowrap" : ""} ${className}`}
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
    <nav aria-label={label} className="mt-6 flex flex-wrap items-center gap-2 text-sm">
      {page > 1 && <Link to={at(page - 1)}>{previous}</Link>}
      {window.map((number, index) => (
        <span key={number} className="flex items-center gap-2">
          {index > 0 && (window[index - 1] ?? 0) < number - 1 && (
            <span className="text-ink-muted" aria-hidden="true">…</span>
          )}
          {number === page
            ? <span className="font-semibold" aria-current="page">{number}</span>
            : <Link to={at(number)}>{number}</Link>}
        </span>
      ))}
      {page < pageCount && <Link to={at(page + 1)}>{next}</Link>}
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
    return (
      <span className="rounded-sm border border-accent border-dashed px-2 py-0.5 text-accent text-xs">
        {messagesFor(locale).unsettled}
      </span>
    )
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
  return (
    <p className="mb-4 rounded border border-line bg-surface px-4 py-2 text-ink-muted text-sm">
      {messagesFor(locale).untranslatedNotice}
    </p>
  )
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
