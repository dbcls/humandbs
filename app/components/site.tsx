import type { ReactNode } from "react"
import { Link } from "react-router"

import { BigAction, Stack } from "~/components/base"
import type { IconName } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, newsItemPath } from "~/public/urls"

/**
 * The pieces the screens are built from — the ones that are layout rather than
 * text. These used to be written inside the CMS, as a markdown directive for
 * the button and inline flex styles for the row that holds them, which is what
 * put an extension to markdown and a raw-HTML route into every document. They
 * are components now, so the markdown dialect does not have to carry them.
 */
export function ActionRow({ children }: { children: ReactNode }) {
  // Left, with everything else on the page: centred buttons over left-set prose
  // give the card two axes, and the eye follows the wrong one back up.
  return <div className="flex flex-wrap items-start gap-6">{children}</div>
}

/**
 * A way in, at the size the front page gives one.
 *
 * **The tone says which half of the site it belongs to** — providing data is
 * accent, using it is brand — and it is the same on the front page and on the
 * screen it leads to, so the two never disagree about what colour "データの
 * 提供" is. Both leave for the application system, so both carry the arrow.
 */
export function ActionButton({ href, label, note, tone, icon, external = true }: {
  href: string
  label: string
  /** Who the way in is for. The front page has one button each and no note. */
  note?: string
  tone: "accent" | "brand"
  icon: IconName
  /** All but one of these leave for the application system. */
  external?: boolean
}) {
  return (
    <div className="flex w-80 max-w-full flex-col items-center gap-2">
      <div className="w-full">
        <BigAction to={href} tone={tone} icon={icon} external={external}>{label}</BigAction>
      </div>
      {note !== undefined && <span className="text-ink-muted text-sm">{note}</span>}
    </div>
  )
}

/**
 * The announcements, newest first: when, and what.
 *
 * **The front page and the listing show the same list**, and used to draw it
 * twice — the same `<ul>`, the same rule between the rows, the same small grey
 * date — with the two copies already a step apart in how tall a row was.
 */
export function NewsList({ locale, items }: {
  locale: Locale
  items: { id: string, title: string, publishedAt: string | null }[]
}) {
  const messages = messagesFor(locale)
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0">
          <Stack gap="tight">
            <span className="text-ink-muted text-xs">
              {item.publishedAt ?? messages.news.undated}
            </span>
            <Link to={href(locale, newsItemPath(item.id))}>{item.title}</Link>
          </Stack>
        </li>
      ))}
    </ul>
  )
}
