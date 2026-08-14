import type { ReactNode } from "react"
import { Link } from "react-router"

import { BigAction, Stack } from "~/components/base"
import type { IconName } from "~/components/icons"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { NewsSummary } from "~/public/site.server"
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
 * The announcements, newest first: when, what, and the first line or two of it.
 *
 * **The front page and the listing show the same list** in the width each has.
 * The listing puts the date in a column of its own, so the dates line up and a
 * reader running down the page reads titles rather than alternating between the
 * two; the front page's column is 408px, where that would leave the title a
 * third of a line, so there the date stays above.
 *
 * **A rule between the entries.** An entry is three lines now that it carries
 * the opening of the article, and the date alone no longer says where one ends
 * and the next begins.
 *
 * **The opening is clamped rather than cut short by the server.** How many
 * characters fit is a question about the width and the language, so the server
 * sends a generous plain-text lead (`leadingText`) and the screen decides how
 * much of it there is room for.
 */
export function NewsList({ locale, items, dateBeside = false }: {
  locale: Locale
  items: NewsSummary[]
  /** Whether the date sits in its own column, which needs the room for one. */
  dateBeside?: boolean
}) {
  const messages = messagesFor(locale)
  const date = (item: NewsSummary) => item.publishedAt ?? messages.news.undated

  return (
    // **The listing is closed on both ends, the front page's column is not.**
    // A listing is the whole of what the page is for, so a rule above the first
    // entry and below the last says where it starts and stops; the column on
    // the front page is one block among several in a card, and closing it would
    // draw a box inside a box.
    <ul className={dateBeside ? "border-line border-t" : ""}>
      {items.map((item) => (
        // The padding is what sets the entries apart from each other. Where the
        // list is not closed, the first and the last give up the half of it
        // that faces outwards — otherwise it lands on top of the gap the list
        // already sits in, and the heading stands 32px clear of its own first
        // line. Where it is closed, that padding is what keeps the words off
        // the rules.
        <li
          key={item.id}
          className={`border-line border-b py-4 ${dateBeside ? "" : "first:pt-0 last:border-b-0 last:pb-0"}`}
        >
          <div className={dateBeside ? "flex items-start gap-4" : ""}>
            {dateBeside && (
              <span className="w-24 shrink-0 text-ink-muted text-sm">{date(item)}</span>
            )}
            <div className="min-w-0 flex-1">
              <Stack gap="tight">
                {!dateBeside && <span className="text-ink-muted text-xs">{date(item)}</span>}
                <Link to={href(locale, newsItemPath(item.id))}>{item.title}</Link>
                {item.excerpt !== "" && (
                  <p className="line-clamp-2 text-ink-muted text-sm">{item.excerpt}</p>
                )}
              </Stack>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
