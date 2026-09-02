import { Link } from "react-router"

import { Button, CLEAR, Fold, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { TermLabel } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type {
  FacetCodeEntryView,
  FacetPanelView,
  FacetValueView,
  FacetView,
} from "~/public/facets.server"
import { href, listPath } from "~/public/urls"
import type { SearchTarget } from "~/search/query.server"

/**
 * The refinement panel beside a listing.
 *
 * **Everything here is a link.** A value carries the address of the search with
 * that value toggled, so choosing and unchoosing are one thing, the panel holds
 * no state of its own, and none of it needs JavaScript. The single exception is
 * a numeric facet, whose two ends have to be typed — that is a GET form, and
 * the listing answers it with a redirect to the address it stands for.
 *
 * A value is shown with the number of rows it would leave, counted with this
 * facet's own condition lifted, so that a second value of the same facet is
 * still reachable after the first has been chosen.
 *
 * **The disease facet has a second way in: its code.** Its values are spread
 * over hundreds of roots, so reading the list to find one means opening the
 * list first. What the box produces is the condition the value would have
 * produced, so nothing about the rollup or the counting changes with the way
 * in.
 *
 * **What names this pane is not here.** The heading, the box and the conditions
 * in force stand above it as one block (`components/search.tsx` の
 * `ListingScreen`), because a narrow window puts that block over the result and
 * the dimensions below it — a reader with one screen of width wants the way to
 * search before twenty ways of narrowing, and the way to undo what is already
 * narrowing it.
 *
 * **Each facet folds, and the panel is a list of what can be refined by.** Open
 * at once, the twenty-odd facets run to several thousand pixels and the reader
 * has to scroll past the whole vocabulary to reach the results. Folded, the
 * dimensions themselves stay in view, which is what somebody who has not chosen
 * anything yet is reading. What is open is derived rather than remembered: a
 * facet holding a condition is open, because a filter in force that cannot be
 * seen is a listing that lies about itself.
 */
export function FacetPanel({ locale, target, query, sort, panel }: {
  locale: Locale
  target: SearchTarget
  /** The current query, which the range form has to carry unchanged. */
  query: string
  sort: string | null
  panel: FacetPanelView | null
}) {
  const messages = messagesFor(locale).search.refine
  if (panel === null || panel.categories.length === 0) return null

  return (
    <nav aria-label={messages.heading} className="text-sm">
      <Stack gap="normal">
        {panel.categories.map((category, index) => (
          <section key={category.code ?? "-"}>
            {category.label !== null && (
              <h3 className="mb-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">
                {category.label}
              </h3>
            )}
            <div className="divide-y divide-line border-line border-b">
              {category.facets.map((facet) => (
                <Facet
                  key={facet.code}
                  locale={locale}
                  target={target}
                  query={query}
                  sort={sort}
                  facet={facet}
                  // The first group is the one a reader who has chosen nothing
                  // is most likely to choose from, and a panel that opened
                  // nothing at all would read as having nothing to offer.
                  open={index === 0 || facet.clearHref !== null || facet.expanded}
                />
              ))}
            </div>
          </section>
        ))}
      </Stack>
    </nav>
  )
}

/** How many of a facet's values are in force, roll-ups included. */

function Facet({ locale, target, query, sort, facet, open }: {
  locale: Locale
  target: SearchTarget
  query: string
  sort: string | null
  facet: FacetView
  open: boolean
}) {
  const messages = messagesFor(locale).search.refine
  return (
    <Fold
      summary={facet.label}
      open={open}
      note={facet.clearHref === null
        ? undefined
        : (
            <Link to={facet.clearHref} className={CLEAR}>
              {messages.clearFacet}
            </Link>
          )}
    >
      <Stack gap="tight">
        {facet.closeHref !== null && (
          <div className="flex justify-end">
            <Link to={facet.closeHref} className="text-brand">{messages.close}</Link>
          </div>
        )}

        {facet.expanded && facet.kind === "vocabulary" && (
          <form method="get" action={href(locale, listPath(target))} className="flex gap-1">
            <Carried query={query} sort={sort} facet={facet.code} />
            <input
              type="search"
              name="find"
              defaultValue={facet.find}
              aria-label={messages.find}
              placeholder={messages.find}
              className={`min-w-0 flex-1 ${CONTROL}`}
            />
            <Button variant="secondary">{messages.apply}</Button>
          </form>
        )}

        {facet.codeEntry !== null && (
          <CodeEntry
            locale={locale}
            target={target}
            query={query}
            sort={sort}
            facet={facet}
            entry={facet.codeEntry}
          />
        )}

        {facet.range !== null
          ? (
              <form method="get" action={href(locale, listPath(target))}>
                <Stack gap="tight">
                  <Carried query={query} sort={sort} facet={facet.expanded ? facet.code : null} />
                  <input type="hidden" name="rangeKey" value={facet.code} />
                  <div className="flex items-center gap-1">
                    <Bound
                      name="rangeFrom"
                      label={messages.from}
                      value={facet.range.from}
                      kind={facet.kind}
                    />
                    <span aria-hidden="true">–</span>
                    <Bound
                      name="rangeTo"
                      label={messages.to}
                      value={facet.range.to}
                      kind={facet.kind}
                    />
                    {facet.range.unit !== null && (
                      <span className="text-ink-muted text-xs">{facet.range.unit}</span>
                    )}
                    <Button variant="secondary" size="xs">{messages.apply}</Button>
                  </div>
                  <div className="flex items-baseline justify-between text-ink-muted text-xs">
                    {facet.range.min !== null && facet.range.max !== null && (
                      <span>{messages.span(facet.range.min, facet.range.max)}</span>
                    )}
                    {facet.range.clearHref !== null && (
                      <Link to={facet.range.clearHref} className="text-brand text-sm">
                        {messages.clear}
                      </Link>
                    )}
                  </div>
                </Stack>
              </form>
            )
          : (
              <ul className="flex flex-col">
                {facet.values.map((value) => (
                  <li key={value.code}>
                    <Value locale={locale} value={value} />
                    {value.children.length > 0 && (
                      <ul className="ml-4 flex flex-col border-line border-l pl-2">
                        {value.children.map((child) => (
                          <li key={child.code}>
                            <Value locale={locale} value={child} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}

        {facet.moreHref !== null && (
          <Link to={facet.moreHref} className="inline-block text-brand">
            {messages.seeAll}
          </Link>
        )}
      </Stack>
    </Fold>
  )
}

/**
 * The box a code is typed into. A GET form like the range inputs: the listing
 * answers it with the address of the refined search, and only what could not be
 * turned into one comes back here to be explained.
 */
function CodeEntry({ locale, target, query, sort, facet, entry }: {
  locale: Locale
  target: SearchTarget
  query: string
  sort: string | null
  facet: FacetView
  entry: FacetCodeEntryView
}) {
  const messages = messagesFor(locale).search.refine
  return (
    <form method="get" action={href(locale, listPath(target))}>
      <Stack gap="tight">
        <Carried query={query} sort={sort} facet={facet.expanded ? facet.code : null} />
        <div className="flex gap-1">
          <input
            type="text"
            name="code"
            defaultValue={entry.value}
            aria-label={messages.code}
            placeholder={messages.codeHint}
            aria-invalid={entry.problem !== null ? true : undefined}
            className={`min-w-0 flex-1 ${CONTROL}`}
          />
          <Button variant="secondary">{messages.apply}</Button>
        </div>
        {entry.problem !== null && (
          <p role="status" className="text-accent text-xs">
            {entry.problem === "unknown-code" ? messages.codeUnknown : messages.codeNoData}
          </p>
        )}
      </Stack>
    </form>
  )
}

/**
 * What a form has to hand back untouched: a GET form replaces the whole query
 * string, so anything it does not carry is dropped from the address.
 */
function Carried({ query, sort, facet }: {
  query: string
  sort: string | null
  facet: string | null
}) {
  return (
    <>
      <input type="hidden" name="q" value={query} />
      {sort !== null && <input type="hidden" name="sort" value={sort} />}
      {facet !== null && <input type="hidden" name="facet" value={facet} />}
    </>
  )
}

/**
 * One end of a range. **A date gets the browser's own date control** — it is
 * the one input where the reader would otherwise have to know the spelling the
 * address uses, and every platform already has a picker for it. The two ends
 * are still a GET form, so a browser without one falls back to a text box that
 * takes the same `YYYY-MM-DD`.
 */
function Bound({ name, label, value, kind }: {
  name: string
  label: string
  value: string
  kind: FacetView["kind"]
}) {
  const date = kind === "date"
  return (
    <input
      type={date ? "date" : "text"}
      inputMode={date ? undefined : "decimal"}
      name={name}
      defaultValue={value}
      aria-label={label}
      className={`${date ? "min-w-0 flex-1" : "w-16"} ${CONTROL}`}
    />
  )
}

function Value({ locale, value }: { locale: Locale, value: FacetValueView }) {
  const messages = messagesFor(locale).search.refine
  return (
    <Link
      to={value.href}
      aria-current={value.selected ? "true" : undefined}
      className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 no-underline ${
        value.selected
          ? "bg-surface-hover font-semibold text-ink"
          : "text-brand hover:bg-surface-hover"
      }`}
    >
      <span className="min-w-0 break-words">
        <TermLabel term={value} />
        {value.selected && (
          <span className="sr-only">
            {" "}
            {messages.selected}
          </span>
        )}
      </span>
      {/*
        **The number alone.** A word after it would be read as part of the
        value's name, and the column of figures is what the eye compares — so
        it is set in the one face whose digits are all the same width.
      */}
      <span className="shrink-0 font-mono text-ink-muted text-xs">{value.count}</span>
    </Link>
  )
}
