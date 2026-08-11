import { createContext, Fragment, useContext, type ReactNode } from "react"
import { Link } from "react-router"

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

/** The bar that names what the page is about, and what sits next to it. */
export function PageHead({ label, children }: { label: string, children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t bg-brand px-5 py-3 text-white">
      <h1 className="font-bold text-xl">{label}</h1>
      {children !== undefined && <div className="flex items-center gap-3 text-sm">{children}</div>}
    </div>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-b border border-line border-t-0 px-5 py-6">{children}</div>
}

export function Section({ title, at, children }: {
  title: string
  /** The anchor of the whole section, when it draws one field. */
  at?: string
  children: ReactNode
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{title}</h2>
      {at !== undefined && <Annotation at={at} />}
      {children}
    </section>
  )
}

export function KeyValue({ title, at, children }: {
  title: string
  /** The anchor of the value below, when the page has one for it. */
  at?: string
  children: ReactNode
}) {
  return (
    <div className="break-inside-avoid py-2">
      <dt className="font-semibold text-ink-muted text-xs">{title}</dt>
      <dd className="mt-1">
        {children}
        {at !== undefined && <Annotation at={at} />}
      </dd>
    </div>
  )
}

export function Table({ headers, children }: { headers: string[], children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface text-left">
            {headers.map((header) => (
              <th key={header} className="border-line border-b px-3 py-2 font-semibold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className = "" }: { children?: ReactNode, className?: string }) {
  return <td className={`border-line border-b px-3 py-2 align-top ${className}`}>{children}</td>
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

const ACCESS_TONE: Record<string, string> = {
  "unrestricted-access": "border-brand text-brand",
  "controlled-access-type-1": "border-accent text-accent",
  "controlled-access-type-2": "border-accent text-accent",
}

export function AccessTypeBadge({ term }: { term: TermView }) {
  const tone = ACCESS_TONE[term.code] ?? "border-line text-ink-muted"
  return (
    <span className={`inline-block text-nowrap rounded-sm border px-2 py-0.5 text-xs ${tone}`}>
      {term.label}
    </span>
  )
}
