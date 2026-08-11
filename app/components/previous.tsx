/**
 * What the published version says where the draft says something else.
 *
 * The mark exists so that nobody has to hunt for what changed, and it opens to
 * the old value because the next question after "this changed" is always "from
 * what". It is drawn from the same view builder as the page around it, so the
 * old value reads exactly as it read when it was the current one.
 */

import type { ShownLine } from "~/admin/changes"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { AnchoredValue } from "~/public/view.server"

import { AccessTypeBadge, LinksValue, Value } from "./page"

export function PreviousMark({ locale, value, heading }: {
  locale: Locale
  value: AnchoredValue | undefined
  /** What is being compared against, as the screen words it. */
  heading: string
}) {
  const t = messagesFor(locale).preview

  if (value === undefined) {
    return (
      <span className="ml-1 rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
        {t.differsHere}
      </span>
    )
  }

  return (
    <details className="mt-1 ml-1 inline-block align-top">
      <summary className="inline-block cursor-pointer rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
        {t.differsHere}
      </summary>
      <div className="mt-1 w-full min-w-64 max-w-xl rounded-sm border border-line bg-surface px-3 py-2">
        <p className="text-ink-muted text-xs">{heading}</p>
        <div className="mt-1 text-sm">
          <PreviousValue locale={locale} value={value} />
        </div>
      </div>
    </details>
  )
}

/**
 * The same mark on an editing screen, where a value is a form value rather than
 * a rendered one. Some places have nothing to show — a difference in the
 * membership of a list is a difference in the list — and there the mark stands
 * on its own.
 */
export function PreviousLines({ locale, lines, heading, termLabel }: {
  locale: Locale
  lines: readonly ShownLine[] | null
  heading: string
  termLabel?: (id: string) => string
}) {
  const t = messagesFor(locale).preview
  const states = messagesFor(locale)

  if (lines === null || lines.length === 0) {
    return (
      <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
        {t.differsHere}
      </span>
    )
  }

  return (
    <details className="inline-block align-top">
      <summary className="inline-block cursor-pointer rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
        {t.differsHere}
      </summary>
      <div className="mt-1 w-full min-w-64 max-w-xl rounded-sm border border-line bg-surface px-3 py-2">
        <p className="text-ink-muted text-xs">{heading}</p>
        <dl className="mt-1 text-sm">
          {lines.map((line, at) => (
            <div key={`${at}-${line.label}`} className="flex gap-2">
              {line.label !== "" && <dt className="text-ink-muted text-xs">{line.label}</dt>}
              <dd className="whitespace-pre-wrap break-all">
                {line.state === "unknown" && <em className="text-ink-muted">{states.unsettled}</em>}
                {line.state === "not-applicable" && (
                  <em className="text-ink-muted">{states.notApplicable}</em>
                )}
                {line.state === "value" && (line.termIds === undefined
                  ? line.text
                  : line.termIds.map((id) => termLabel?.(id) ?? id).join(", "))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}

function PreviousValue({ locale, value }: { locale: Locale, value: AnchoredValue }) {
  if (value.kind === "field") return <Value field={value.field} locale={locale} />
  if (value.kind === "term") {
    return value.term === null ? null : <AccessTypeBadge term={value.term} />
  }
  if (value.kind === "links") {
    return <LinksValue links={value.links} locale={locale} linked={false} />
  }
  return (
    <ul>
      {value.items.map((item, at) => <li key={`${at}-${item}`} className="break-all">{item}</li>)}
    </ul>
  )
}
