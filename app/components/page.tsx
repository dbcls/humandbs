import { Fragment, type ReactNode } from "react"

import { linkHref } from "~/content/richtext"
import type { RichText, Span } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { FieldView, TermView } from "~/public/view.server"

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
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

export function Section({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{title}</h2>
      {children}
    </section>
  )
}

export function KeyValue({ title, children }: { title: string, children: ReactNode }) {
  return (
    <div className="break-inside-avoid py-2">
      <dt className="font-semibold text-ink-muted text-xs">{title}</dt>
      <dd className="mt-1">{children}</dd>
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
 */
export function Value({ field, locale }: { field: FieldView, locale: Locale }) {
  if (field.state === "not-applicable") {
    return <span className="text-ink-muted italic">{messagesFor(locale).notApplicable}</span>
  }
  if (field.state === "rich") {
    return field.text.length === 0 ? null : <Prose text={field.text} />
  }
  return field.text === "" ? null : <>{field.text}</>
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
