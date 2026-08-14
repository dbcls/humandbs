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
  // Centred in the card. The ways in are the one thing on a page that is
  // addressed to the whole of it rather than read in sequence, and a pair of
  // filled blocks set left leaves the card lopsided at the width they are held
  // to; v1 centres them too.
  //
  // **They narrow rather than stack.** The pair is a choice between two halves
  // of the site, and one above the other reads as a first step and a second.
  // Below the phone breakpoint there is no width left to narrow into, so there
  // they do wrap.
  //
  // **Two rows rather than a row of columns**: the blocks share the first and
  // what is written under them shares the second, so a label that runs to two
  // lines makes both blocks taller instead of leaving one of the pair short.
  // The second row costs nothing where nothing is written under them — the
  // distance to a note is on the note itself, so an empty row is an empty row.
  return (
    <div className="grid justify-center gap-x-4 gap-y-4 sm:auto-cols-[minmax(0,20rem)] sm:grid-flow-col sm:grid-rows-[1fr_auto] sm:gap-x-6 sm:gap-y-0">
      {children}
    </div>
  )
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
    // 20rem is the width it wants, and the column it sits in gives it that or
    // less. **It takes both of the row's rows** so that the block lands in the
    // first and the note in the second, whatever either of them is doing in the
    // other column.
    <div className="grid w-full max-w-80 sm:row-span-2 sm:grid-rows-subgrid">
      <BigAction to={href} tone={tone} icon={icon} external={external}>{label}</BigAction>
      {note !== undefined && <span className="pt-2 text-center text-ink-muted text-sm">{note}</span>}
    </div>
  )
}

/**
 * The announcements, newest first: when, and what.
 *
 * **The front page and the listing show the same list**, and used to draw it
 * twice — the same `<ul>`, the same small grey date — with the two copies
 * already a step apart in how tall a row was.
 *
 * **No rule between the entries.** The date above each title already opens it,
 * so a line as well draws the same boundary twice; the space is the separation,
 * as it is everywhere else on the site.
 */
export function NewsList({ locale, items }: {
  locale: Locale
  items: { id: string, title: string, publishedAt: string | null }[]
}) {
  const messages = messagesFor(locale)
  return (
    <Stack gap="normal" as="ul">
      {items.map((item) => (
        <li key={item.id}>
          <Stack gap="tight">
            <span className="text-ink-muted text-xs">
              {item.publishedAt ?? messages.news.undated}
            </span>
            <Link to={href(locale, newsItemPath(item.id))}>{item.title}</Link>
          </Stack>
        </li>
      ))}
    </Stack>
  )
}
