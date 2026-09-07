import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react"
import { Form, Link } from "react-router"

import { CLEAR, EDGE_SHADE, Fold, PANE_LABEL, Stack } from "~/components/base"
import { CONTROL } from "~/components/form"
import { TermLabel } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { matches, rolledUpFind } from "~/public/facet-find"
import type { FacetPanelView, FacetValueView, FacetView } from "~/public/facets.server"
import { href, listPath } from "~/public/urls"
import { useAsk } from "~/search-as-typed"
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
        {panel.categories.map((category) => (
          <section key={category.code ?? "-"}>
            {category.label !== null && (
              <h3 className={`mb-2 ${PANE_LABEL}`}>
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
                  // **A facet is opened by a reason, not by where it sits.** A
                  // condition in force that cannot be seen is a listing that
                  // lies about itself, and that is the only reason there is:
                  // opening the first group as well cost 800px of scroll
                  // before the reader reached the dimension they came for.
                  // **The reason going away does not close it again** — that
                  // part is `Fold`'s.
                  open={facet.clearHref !== null}
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
  const { form, ask } = useAsk(href(locale, listPath(target)))
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
                <Form
                  ref={form}
                  method="get"
                  action={href(locale, listPath(target))}
                  preventScrollReset
                >
                  <Stack gap="tight">
                    <Carried query={query} sort={sort} />
                    <input type="hidden" name="rangeKey" value={facet.code} />
                    {facet.kind === "date"
                      ? (
                          <>
                            <Bound
                              name="rangeFrom"
                              label={messages.dateFrom}
                              value={facet.range.from}
                              kind={facet.kind}
                              ask={ask}
                            />
                            <Bound
                              name="rangeTo"
                              label={messages.dateTo}
                              value={facet.range.to}
                              kind={facet.kind}
                              ask={ask}
                            />
                          </>
                        )
                      : (
                          <div className="flex items-center gap-1">
                            <Bound
                              name="rangeFrom"
                              label={messages.from}
                              value={facet.range.from}
                              kind={facet.kind}
                              ask={ask}
                            />
                            <span aria-hidden="true">–</span>
                            <Bound
                              name="rangeTo"
                              label={messages.to}
                              value={facet.range.to}
                              kind={facet.kind}
                              ask={ask}
                            />
                            {facet.range.unit !== null && (
                              <span className="text-ink-muted text-xs">{facet.range.unit}</span>
                            )}
                          </div>
                        )}
                  </Stack>
                </Form>
              </>
            )
          : <Values locale={locale} values={facet.values} kind={facet.kind} />}
      </Stack>
    </Fold>
  )
}

/**
 * How many values stand in the box before the list has to be scrolled.
 *
 * Measured rather than chosen: a value is 29.5px (three values 139px, five
 * 198px), so nine of them fill the 288px the list is allowed. **What this
 * decides is only whether the box to narrow them is drawn** — the list itself
 * always carries the ceiling, which does nothing until there is something to
 * scroll.
 */
const VALUES_IN_BOX = 9

/**
 * Every value a facet holds, and the box that narrows them.
 *
 * **The list scrolls rather than being cut short.** The widest facet carries
 * 389 values; cutting it and offering a way to the rest costs either an address
 * that says something other than the conditions in force, or a reader without
 * script who cannot reach past the cut (`docs/public-pages.md` の「絞り込み」).
 *
 * **The box narrows what is already on the page**, so it asks the server for
 * nothing and what it was given does not go into the address — it changes what
 * the reader is looking at, not what the search returned. Without script it
 * does nothing, and the values are all there to be scrolled to.
 *
 * **The chosen values are first** (`facets.server.ts`), so a condition in force
 * is never below the fold of the box.
 */
function Values({ locale, values, kind }: {
  locale: Locale
  values: FacetValueView[]
  kind: FacetView["kind"]
}) {
  const messages = messagesFor(locale).search.refine
  const [find, setFind] = useState("")
  const needle = kind === "disease" ? rolledUpFind(find, values) : find
  const shown = values.filter((value) => matches(needle, value))
  const box = useRef<HTMLUListElement>(null)
  // **The far edge is shaded before anything has measured it.** How many values
  // stand in the box is known where the page is built, and a reader with no
  // script never reaches the measurement — the one thing saying the list goes
  // on would be the thing that needs script to appear.
  const [reach, setReach] = useState({ back: false, on: values.length > VALUES_IN_BOX })

  // Both ends are read from the same event, and the state only changes when one
  // of them crosses.
  const measure = useCallback(() => {
    const el = box.current
    if (el === null) return
    const room = el.scrollHeight - el.clientHeight
    setReach((was) => {
      const back = el.scrollTop > 1
      const on = el.scrollTop < room - 1
      return was.back === back && was.on === on ? was : { back, on }
    })
  }, [])

  // **The list is drawn inside a shut fold**, so how much of it there is cannot
  // be known until the reader opens one; and the box above it changes how much
  // there is left to travel with every word typed into it.
  useEffect(() => {
    const el = box.current
    if (el === null) return
    measure()
    const watch = new ResizeObserver(() => {
      measure()
    })
    watch.observe(el)
    return () => {
      watch.disconnect()
    }
  }, [measure])

  return (
    <Stack gap="tight">
      {values.length > VALUES_IN_BOX && (
        <input
          type="search"
          value={find}
          onChange={(event) => { setFind(event.target.value) }}
          aria-label={messages.find}
          placeholder={messages.find}
          className={`w-full ${CONTROL}`}
        />
      )}
      <div className="relative">
        <ul ref={box} onScroll={measure} className="flex max-h-72 flex-col overflow-y-auto">
          {shown.map((value) => (
            <li key={value.code}>
              <Value locale={locale} value={value} kind={kind} />
            </li>
          ))}
        </ul>
        {reach.back && <div className={EDGE_SHADE.top} />}
        {reach.on && <div className={EDGE_SHADE.bottom} />}
      </div>
    </Stack>
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
function Carried({ query, sort }: {
  query: string
  sort: string | null
}) {
  return (
    <>
      <input type="hidden" name="q" value={query} />
      {sort !== null && <input type="hidden" name="sort" value={sort} />}
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
 *
 * **Neither end has a button, and the two ask at different moments.**
 *
 * **A date asks the moment it has one.** The control hands over a whole date or
 * nothing at all, and the way most readers give it one is a single gesture in
 * the picker — so there is nothing to wait for, and the presets above it
 * already work this way.
 *
 * **A number waits until it has been left.** Digits are not letters: every
 * prefix of a word matches a superset of what the reader meant, so a result on
 * the way is the answer coming closer, but **each digit multiplies the bound by
 * ten**, and the numbers on the way are different questions with correct and
 * useless answers. Measured on the read length, an upper bound typed as `150`
 * passes 4 rows and 13 rows before reaching 827; the smallest probe number in
 * the data is 450, so typing it answers "nothing found" twice first. So the
 * form asks on the way out of the field, **and only if the value is not the one
 * already in force** — tabbing through a pane must not re-ask what it is
 * already showing. Enter asks too, since a form with two fields and no button
 * would otherwise do nothing with it.
 */
function Bound({ name, label, value, kind, ask }: {
  name: string
  label: string
  value: string
  kind: FacetView["kind"]
  /** Go to the address this form now stands for. */
  ask: () => void
}) {
  const date = kind === "date"
  const settled = (event: { currentTarget: HTMLInputElement }) => {
    if (event.currentTarget.value !== value) ask()
  }
  const input = (
    <input
      type={date ? "date" : "text"}
      inputMode={date ? undefined : "decimal"}
      name={name}
      defaultValue={value}
      aria-label={date ? undefined : label}
      {...(date
        ? { onChange: settled }
        : {
            onBlur: settled,
            onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key !== "Enter") return
              // The form has no button to submit it, so nothing would happen —
              // and a page reload here would be a page the reader lost.
              event.preventDefault()
              settled(event)
            },
          })}
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
