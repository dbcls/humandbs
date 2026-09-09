/**
 * What the published version says where the draft says something else.
 *
 * The mark exists so that nobody has to hunt for what changed, and it opens to
 * the old value because the next question after "this changed" is always "from
 * what". It is drawn from the same view builder as the page around it, so the
 * old value reads exactly as it read when it was the current one.
 */

import { useEffect, useRef, type ReactNode } from "react"
import { useLocation } from "react-router"

import type { ShownLine } from "~/admin/changes"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { AnchoredValue } from "~/public/view.server"

import { Badge, Stack } from "./base"
import { AccessTypeBadge, LinksValue, Value } from "./page"

/**
 * The mark itself: a badge, whether or not it opens. It was written out four
 * times here — the same border, padding and colour — which is how the four
 * copies came to disagree with the badge everything else uses.
 */
function Mark({ label }: { label: string }) {
  return <Badge tone="accent">{label}</Badge>
}

/**
 * The mark with the old value folded behind it.
 *
 * **It closes on Escape, on a press anywhere else, and on going somewhere.** A
 * panel that only closes by pressing its own mark again stays open over the
 * page while the reader carries on with something else, and a screen full of
 * fields carries dozens of these. The two listeners are on the document because
 * the press that should close it is by definition not on this element, and the
 * address is watched because a client-side move does not reload the page.
 *
 * The mark is not a menu's control — it is a badge standing beside a value —
 * but what it opens is a panel, and a panel is closed the same three ways
 * wherever it hangs (`docs/ui.md`).
 */
function OldValue({ label, heading, children }: {
  label: string
  /** What is being compared against, as the screen words it. */
  heading: string
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
    // Focus goes back to the mark that opened it: closing a panel the reader is
    // inside would otherwise leave focus on nothing.
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
    <details ref={box} className="inline-flex flex-col items-start gap-2 align-top">
      <summary className="inline-block cursor-pointer list-none marker:content-none">
        <Mark label={label} />
      </summary>
      <div className="w-full min-w-64 max-w-xl rounded border border-line bg-surface px-3 py-2">
        <Stack gap="tight">
          <p className="text-ink-muted text-xs">{heading}</p>
          <div className="text-sm">{children}</div>
        </Stack>
      </div>
    </details>
  )
}

export function PreviousMark({ locale, value, heading }: {
  locale: Locale
  value: AnchoredValue | undefined
  /** What is being compared against, as the screen words it. */
  heading: string
}) {
  const t = messagesFor(locale).preview

  if (value === undefined) return <Mark label={t.differsHere} />

  return (
    <OldValue label={t.differsHere} heading={heading}>
      <PreviousValue locale={locale} value={value} />
    </OldValue>
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

  if (lines === null || lines.length === 0) return <Mark label={t.differsHere} />

  return (
    <OldValue label={t.differsHere} heading={heading}>
      <dl>
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
    </OldValue>
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
