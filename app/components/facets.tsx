import type { ComponentProps } from "react"
import { Form, Link } from "react-router"

import { Button, CLEAR, Fold, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { TermLabel } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import type { FacetPanelView, FacetValueView, FacetView } from "~/public/facets.server"
import { href, listPath } from "~/public/urls"
import { useSearchAsTyped } from "~/search-as-typed"
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
 * **Choosing does not move the reader.** Everything the panel offers goes
 * through `RefineLink` or a `Form`, which is what keeps that true of anything
 * added to it later.
 *
 * A value is shown with the number of rows it would leave, counted with this
 * facet's own condition lifted, so that a second value of the same facet is
 * still reachable after the first has been chosen.
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
            <RefineLink to={facet.clearHref} className={CLEAR}>
              {messages.clearFacet}
            </RefineLink>
          )}
    >
      <Stack gap="tight">
        {facet.closeHref !== null && (
          <div className="flex justify-end">
            <RefineLink to={facet.closeHref} className="text-brand">{messages.close}</RefineLink>
          </div>
        )}

        {facet.expanded && (facet.kind === "vocabulary" || facet.kind === "disease") && (
          <FindValue locale={locale} target={target} query={query} sort={sort} facet={facet} />
        )}

        {facet.range !== null
          ? (
              <>
                {facet.range.presets.length > 0 && (
                  <div className="flex gap-1">
                    {facet.range.presets.map((preset) => (
                      <RefineLink
                        key={preset.label}
                        to={preset.href}
                        aria-current={preset.current ? "true" : undefined}
                        className={`flex-1 rounded border px-1 py-1 text-center text-xs no-underline ${
                          preset.current
                            ? "border-brand bg-surface-hover font-semibold text-ink"
                            : "border-line text-brand hover:bg-surface-hover"
                        }`}
                      >
                        {preset.label}
                      </RefineLink>
                    ))}
                  </div>
                )}
                <Form method="get" action={href(locale, listPath(target))} preventScrollReset>
                  <Stack gap="tight">
                    <Carried query={query} sort={sort} facet={facet.expanded ? facet.code : null} />
                    <input type="hidden" name="rangeKey" value={facet.code} />
                    {facet.kind === "date"
                      ? (
                          <>
                            <Bound
                              name="rangeFrom"
                              label={messages.dateFrom}
                              value={facet.range.from}
                              kind={facet.kind}
                            />
                            <Bound
                              name="rangeTo"
                              label={messages.dateTo}
                              value={facet.range.to}
                              kind={facet.kind}
                            />
                            <div className="flex justify-end">
                              <Button variant="secondary" size="xs">{messages.apply}</Button>
                            </div>
                          </>
                        )
                      : (
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
                            {/*
                              **The gap that holds the pair together is not the
                              one that separates them from the operation.** Both
                              ends and the unit are one thing to read; pushing
                              the button to the edge says so, and stands it on
                              the same line as the one a date facet ends with.
                            */}
                            <Button variant="secondary" size="xs" className="ml-auto">
                              {messages.apply}
                            </Button>
                          </div>
                        )}
                  </Stack>
                </Form>
              </>
            )
          : (
              <ul className="flex flex-col">
                {facet.values.map((value) => (
                  <li key={value.code}>
                    <Value locale={locale} value={value} kind={facet.kind} />
                  </li>
                ))}
              </ul>
            )}

        {facet.moreHref !== null && (
          <RefineLink to={facet.moreHref} className="inline-block text-brand">
            {messages.seeAll}
          </RefineLink>
        )}
      </Stack>
    </Fold>
  )
}

/**
 * The box that narrows an opened facet to the values worth reading.
 *
 * **It narrows as the words are typed, and carries no button.** The list it
 * filters is right underneath it, so the answer to "did that work" is on the
 * screen already; a button in a pane a quarter of the page wide would take a
 * quarter of the line to ask for what is about to happen anyway. **Pressing
 * Enter still submits it** — a form whose only field that blocks implicit
 * submission is this one needs no button to be submitted — so the keyboard and
 * a page with no script reach the same address.
 *
 * **The two ends of a range keep their button.** Two fields block implicit
 * submission between them, so a range with no button could not be asked for at
 * all without a script.
 */
function FindValue({ locale, target, query, sort, facet }: {
  locale: Locale
  target: SearchTarget
  query: string
  sort: string | null
  facet: FacetView
}) {
  const messages = messagesFor(locale).search.refine
  const action = href(locale, listPath(target))
  const { form, field } = useSearchAsTyped({ action })

  return (
    <Form ref={form} method="get" action={action} preventScrollReset>
      <Carried query={query} sort={sort} facet={facet.code} />
      <input
        type="search"
        name="find"
        defaultValue={facet.find}
        aria-label={messages.find}
        placeholder={messages.find}
        className={`w-full ${CONTROL}`}
        {...field}
      />
    </Form>
  )
}

/**
 * A link that narrows the listing beside it rather than going anywhere.
 *
 * **The reader is standing in the panel when they choose**, often well down it,
 * and the panel is beside a result they are watching change. Landing at the top
 * of the document — which is what a new address means by default — takes both
 * the value just chosen and the rows it left out of sight, so the one thing the
 * reader asked to see is the one thing they have to go looking for.
 *
 * The address still changes, so the choice is shared and stepping back still
 * lifts it. What is held is only where the reader was standing.
 */
function RefineLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} preventScrollReset />
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
 *
 * **A date names its end where a number does not.** `年/月/日` and a picker do
 * not fit beside a second copy of themselves in the width of the pane, so the
 * two dates stand one above the other, and a bound on its own line has room
 * for the word that says which one it is. The numbers keep their pair around a
 * dash, which is what says it there.
 */
function Bound({ name, label, value, kind }: {
  name: string
  label: string
  value: string
  kind: FacetView["kind"]
}) {
  const date = kind === "date"
  const input = (
    <input
      type={date ? "date" : "text"}
      inputMode={date ? undefined : "decimal"}
      name={name}
      defaultValue={value}
      aria-label={date ? undefined : label}
      className={`${date ? "w-full" : "w-16"} ${CONTROL}`}
    />
  )
  if (!date) return input
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-ink-muted text-xs">{label}</span>
      {input}
    </label>
  )
}

/**
 * **A disease value shows the code it is filed under, and no other facet does.**
 * An ICD10 code is a shared key — it is on the dataset page, in the JSON API and
 * in whatever the reader brought with them — where the code of a platform or an
 * assay is a slug this site made up to put in an address. It leads rather than
 * follows because the headings are long and the pane is a quarter of the page:
 * set first, the codes make a column that can be read down, where after a
 * heading that wraps to three lines a code lands somewhere different each time.
 */
function Value({ locale, value, kind }: {
  locale: Locale
  value: FacetValueView
  kind: FacetView["kind"]
}) {
  const messages = messagesFor(locale).search.refine
  return (
    <RefineLink
      to={value.href}
      aria-current={value.selected ? "true" : undefined}
      className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 no-underline ${
        value.selected
          ? "bg-surface-hover font-semibold text-ink"
          : "text-brand hover:bg-surface-hover"
      }`}
    >
      <span className="min-w-0 break-words">
        {kind === "disease" && (
          <>
            <code className="mr-1 font-mono text-ink-muted text-xs">{value.code}</code>
            {" "}
          </>
        )}
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
    </RefineLink>
  )
}
