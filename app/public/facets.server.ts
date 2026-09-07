/**
 * The panel the two listings refine themselves with.
 *
 * **Every value is a link, and the address is the whole of the state.** There
 * is no form to submit and nothing to remember between requests, which is what
 * makes the panel work with JavaScript turned off and a refined result
 * shareable by copying the address. Choosing a value and unchoosing it are the
 * same link, because both are just "the search with this condition toggled".
 *
 * **A facet carries every value it has**, and the list scrolls inside the box
 * it stands in rather than being cut short with a way to the rest. What a way
 * to the rest would cost is either an address that says something other than
 * the conditions in force, or a reader without script who cannot reach past
 * the cut; scrolling costs neither (`docs/public-pages.md` の「絞り込み」).
 * **The box that narrows the list is drawn in the browser** over the values
 * already sent (`facet-find.ts`), so it asks nothing of this module.
 *
 * Counts come from [counts.server.ts](../search/counts.server.ts), which is
 * where the rule that a facet is counted with its own condition lifted lives.
 */

import type { Executor } from "~/db/client.server"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { makerOf } from "~/public/view.server"
import type { FacetDefinition } from "~/search/catalog.server"
import { resolveTerms } from "~/search/catalog.server"
import {
  countTerms,
  dateBounds,
  numberBounds,
  type DateBounds,
  type TermCount,
} from "~/search/counts.server"
import { OPEN_BOUND, serializeQuery, type DslRange, type QueryNode } from "~/search/dsl"
import { DATE_FACETS, type DateFacet, type QueryFields } from "~/search/fields"
import { messagesFor } from "~/i18n/messages"
import type { SearchTarget } from "~/search/query.server"
import { readSelection, toggleTerm, withoutFacet, withRange } from "~/search/selection"

import { href, listPath, searchQuery } from "./urls"

export interface FacetValueView {
  code: string
  label: string
  /** Who makes what this names, drawn apart from the rest (`TermLabel`). */
  maker: string | null
  count: number
  selected: boolean
  /** The same search with this value toggled. */
  href: string
}

/**
 * A window offered as one press, rather than as two dates to type.
 *
 * **What the address carries is the absolute day**, so a link that is shared or
 * bookmarked keeps meaning what it meant when it was made. Which window is in
 * force is worked back out from that day against today, so a bookmark read on
 * another day matches none of them — it still holds the same rows.
 */
export interface RangePresetView {
  label: string
  /** The search with this window in force, or with the range lifted for "all". */
  href: string
  current: boolean
}

export interface FacetRangeView {
  /** What the inputs hold; empty when that end is open. */
  from: string
  to: string
  unit: string | null
  /**
   * The windows offered above the inputs. Empty on a facet that offers none:
   * a number has no window everybody means the same thing by, the way the last
   * year is one.
   */
  presets: readonly RangePresetView[]
}

export interface FacetView {
  code: string
  label: string
  /**
   * A date takes the same pair of inputs as a number and a different keyboard,
   * which is the whole of the difference to the screen. **A disease draws like
   * a vocabulary**; it is named apart because it is counted at the root of the
   * classification and the level below is never offered (`docs/public-pages.md`
   * の「絞り込み」).
   */
  kind: "vocabulary" | "number" | "date" | "disease"
  /** Every value the result carries under this key, the chosen ones first. */
  values: FacetValueView[]
  /**
   * The address with this facet's own conditions dropped, or null when it has
   * none. **How many values are chosen is not said** — the number beside a
   * value is how many rows it leaves, and a second number in the same panel
   * counting something else is read as one of those.
   */
  clearHref: string | null
  range: FacetRangeView | null
}

export interface FacetCategoryView {
  code: string | null
  label: string | null
  facets: FacetView[]
}

export interface FacetPanelView {
  categories: FacetCategoryView[]
  /** Which facet the range form writes into, if any is expanded. */
  target: SearchTarget
}

export interface FacetPanelRequest {
  target: SearchTarget
  ast: QueryNode | null
  fields: QueryFields
  definitions: readonly FacetDefinition[]
  locale: Locale
  /** `?sort=`, kept as it arrived so that refining does not reorder the result. */
  sort: string | null
  /** `?order=`, kept for the same reason. */
  order: string | null
  /** `?size=`, kept for the same reason. `null` is the default size. */
  size: number | null
  /**
   * The calendar day the relative windows are measured back from, `YYYY-MM-DD`.
   * Passed in rather than read from the clock so that the panel a request gets
   * is decided entirely by the request.
   */
  today: string
}

export async function facetPanel(
  db: Executor,
  request: FacetPanelRequest,
): Promise<FacetPanelView> {
  const { ast, fields, definitions, locale, target } = request
  const selection = readSelection(ast, fields)
  const chosenTerms = (code: string): string[] => selection.terms.get(code) ?? []

  const address = (query: QueryNode | null) =>
    href(locale, listPath(target) + searchQuery({
      q: serializeQuery(query),
      sort: request.sort,
      order: request.order,
      page: 1,
      size: request.size,
    }))

  /** The tree a facet is counted against: this search, minus its own condition. */
  const basisFor = (code: string): QueryNode | null =>
    selection.terms.has(code) || selection.ranges.has(code)
      ? withoutFacet(ast, fields, code)
      : ast

  const vocabularies = definitions.filter((one) => one.field.kind !== "number")
  const numbers = definitions.filter((one) => one.field.kind === "number")
  const untouched = (one: FacetDefinition) =>
    !selection.terms.has(one.field.code) && !selection.ranges.has(one.field.code)

  // The dates are counted the same way everything else is: with their own
  // condition lifted, so that a chosen span does not become the only span the
  // inputs will suggest.
  const datesChosen = DATE_FACETS.filter((field) =>
    selection.terms.has(field) || selection.ranges.has(field))

  const [shared, perFacet, sharedBounds, perFacetBounds, dates]
    = await Promise.all([
      countTerms(
        db,
        { target, ast, fields },
        vocabularies.filter(untouched).map((one) => one.field.keyId),
      ),
      Promise.all(vocabularies.filter((one) => !untouched(one)).map((one) =>
        countTerms(db, { target, ast: basisFor(one.field.code), fields }, [one.field.keyId]))),
      numberBounds(
        db,
        { target, ast, fields },
        numbers.filter(untouched).map((one) => one.field.keyId),
      ),
      Promise.all(numbers.filter((one) => !untouched(one)).map((one) =>
        numberBounds(db, { target, ast: basisFor(one.field.code), fields }, [one.field.keyId]))),
      Promise.all([
        dateBounds(db, { target, ast, fields }),
        ...datesChosen.map((field) => dateBounds(db, { target, ast: basisFor(field), fields })),
      ]),
    ])

  const [sharedDates, ...ownDates] = dates
  const dateSpan = (field: DateFacet): DateBounds | null => {
    const at = datesChosen.indexOf(field)
    return at === -1 ? sharedDates[field] : ownDates[at]?.[field] ?? null
  }

  const counts = new Map<string, TermCount[]>()
  for (const row of [...shared, ...perFacet.flat()]) {
    counts.set(row.keyId, [...(counts.get(row.keyId) ?? []), row])
  }
  const bounds = new Map(
    [...sharedBounds, ...perFacetBounds.flat()].map((row) => [row.keyId, row]),
  )

  // A value that has been chosen but matches nothing any more still has to be
  // drawn, or there is no way left to take it off.
  const missing = vocabularies.flatMap((one) => {
    const seen = new Set((counts.get(one.field.keyId) ?? []).map((row) => row.code))
    const setId = one.field.setId
    if (setId === null) return []
    return chosenTerms(one.field.code)
      .filter((code) => !seen.has(code))
      .map((code) => ({ setId, code }))
  })
  const resolved = new Map(
    (await resolveTerms(db, missing)).map((term) => [`${term.setId}/${term.code}`, term]),
  )

  const views = definitions.map((one): FacetView => {
    const code = one.field.code
    const label = catalogLabel(one, locale)
    const shell = {
      code,
      label,
      kind: one.field.kind,
      clearHref: selection.terms.has(code) || selection.ranges.has(code)
        ? address(withoutFacet(ast, fields, code))
        : null,
    }
    const empty = { ...shell, values: [], range: null }
    if (one.field.kind === "number") {
      const chosenRange = selection.ranges.get(code)
      const span = bounds.get(one.field.keyId)
      // Nothing in the result carries a number under this key, and nobody is
      // asking for one: a pair of inputs over an empty facet is only noise.
      if (span === undefined && chosenRange === undefined) return empty
      return {
        ...empty,
        range: rangeView({ definition: one, chosen: chosenRange, ast, fields, address }),
      }
    }

    const chosen = chosenTerms(code)
    const found = counts.get(one.field.keyId) ?? []
    const byCode = new Map(found.map((row) => [row.code, row]))
    const valueOf = (
      termCode: string,
      row: TermCount | undefined,
      selected: boolean,
    ): FacetValueView => {
      const term = resolved.get(`${one.field.setId ?? ""}/${termCode}`)
      const known = row ?? term
      const label = known === undefined ? termCode : catalogLabel(known, locale)
      return {
        code: termCode,
        label,
        maker: known === undefined ? null : makerOf(known.maker, label),
        count: row?.count ?? 0,
        selected,
        href: address(toggleTerm(ast, fields, code, termCode)),
      }
    }

    // **The chosen values come first.** The list can be longer than the box it
    // stands in, and a condition in force that the reader would have to scroll
    // to find is a filter they cannot see they are under.
    const taken = chosen.map((termCode) => valueOf(termCode, byCode.get(termCode), true))
    const rest = found
      .filter((row) => !chosen.includes(row.code))
      .map((row) => valueOf(row.code, row, false))

    return { ...empty, values: [...taken, ...rest] }
  })

  return {
    categories: withDates(
      categorise(views, definitions, locale),
      DATE_FACETS.flatMap((field) => {
        const view = dateView({
          field,
          locale,
          selection,
          span: dateSpan(field),
          today: request.today,
          ast,
          fields,
          address,
        })
        return view === null ? [] : [view]
      }),
    ),
    target,
  }
}

/**
 * A date as the panel offers it: the same pair of inputs a number takes, over a
 * column of the search row rather than a facet table ([fields.ts](../search/fields.ts)).
 *
 * **A date the result never carries is not offered.** Two empty boxes over a
 * span that does not exist are a control that cannot do anything, and the
 * modification dates are exactly that until the application system is reachable
 * ([development.md](../../docs/development.md) の「上流のキャッシュを更新する」).
 */
function dateView(input: {
  field: DateFacet
  locale: Locale
  selection: { terms: ReadonlyMap<string, string[]>, ranges: ReadonlyMap<string, DslRange> }
  span: DateBounds | null
  today: string
  ast: QueryNode | null
  fields: QueryFields
  address: (query: QueryNode | null) => string
}): FacetView | null {
  const { field, locale, selection, span, today, ast, fields, address } = input
  // A single day written as a condition is a span of one day. The panel has no
  // other way to draw it, and drawing nothing would leave it with no way off.
  const [only] = selection.terms.get(field) ?? []
  const chosen = selection.ranges.get(field)
    ?? (only === undefined ? undefined : { from: only, to: only })
  if (span === null && chosen === undefined) return null

  const messages = messagesFor(locale).search.refine
  const lifted = address(withoutFacet(ast, fields, field))
  const presets: RangePresetView[] = [
    { label: messages.presetAll, href: lifted, current: chosen === undefined },
    ...DATE_PRESET_YEARS.map((years) => {
      const from = datePresetFrom(today, years)
      return {
        label: messages.presetYears(years),
        href: address(withRange(ast, fields, field, { from, to: OPEN_BOUND })),
        // A window is in force when it is the whole of the condition: the same
        // opening day, and nothing closing it. A reader who typed those two
        // dates by hand gets the window lit, which is the same search.
        current: chosen?.from === from && chosen.to === OPEN_BOUND,
      }
    }),
  ]

  return {
    code: field,
    label: messagesFor(locale).search.fields[field],
    kind: "date",
    values: [],
    clearHref: chosen === undefined ? null : lifted,
    range: {
      from: writtenBound(chosen?.from),
      to: writtenBound(chosen?.to),
      unit: null,
      presets,
    },
  }
}

/** How far back the windows a date facet offers reach, in the order drawn. */
export const DATE_PRESET_YEARS = [1, 5, 10] as const

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * The day a relative window opens on: the same calendar day, `years` earlier.
 *
 * **The 29th of February has no counterpart in a common year.** The day is
 * pulled back to the end of the month rather than let roll into March, so the
 * window a reader is offered never opens later than the one they asked for.
 */
export function datePresetFrom(today: string, years: number): string {
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number)
  const opened = year - years
  const leap = opened % 4 === 0 && (opened % 100 !== 0 || opened % 400 === 0)
  const last = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1] ?? 31
  const pad = (value: number, width: number) => String(value).padStart(width, "0")
  return `${pad(opened, 4)}-${pad(month, 2)}-${pad(Math.min(day, last), 2)}`
}

/**
 * The dates at the head of the panel, in the box that holds what the row itself
 * is — when it was published, when it changed, who may take it. They are put
 * there rather than sorted there, because they are not catalog keys and have no
 * place in the catalog's order.
 */
function withDates(
  categories: FacetCategoryView[],
  dates: readonly FacetView[],
): FacetCategoryView[] {
  if (dates.length === 0) return categories
  const [first, ...rest] = categories
  return first?.label === null
    ? [{ ...first, facets: [...dates, ...first.facets] }, ...rest]
    : [{ code: null, label: null, facets: [...dates] }, ...categories]
}

function rangeView(input: {
  definition: FacetDefinition
  chosen: DslRange | undefined
  ast: QueryNode | null
  fields: QueryFields
  address: (query: QueryNode | null) => string
}): FacetRangeView {
  const { definition, chosen } = input
  return {
    from: writtenBound(chosen?.from),
    to: writtenBound(chosen?.to),
    unit: definition.canonicalUnit,
    presets: [],
  }
}

/** What an input holds for one end of a range: empty when that end is open. */
function writtenBound(bound: string | undefined): string {
  return bound === undefined || bound === OPEN_BOUND ? "" : bound
}

/** Facets grouped under their category heading, in the catalog's order. */
function categorise(
  views: readonly FacetView[],
  definitions: readonly FacetDefinition[],
  locale: Locale,
): FacetCategoryView[] {
  const categories: FacetCategoryView[] = []
  views.forEach((view, at) => {
    const definition = definitions[at]
    if (definition === undefined) return
    const code = definition.categoryCode
    const last = categories[categories.length - 1]
    if (last?.code === code) {
      last.facets.push(view)
      return
    }
    const labelEn = definition.categoryLabelEn
    categories.push({
      code,
      // A category with no label is drawn without a heading, and so is a key
      // that was given no category at all.
      label: code === null || labelEn === null
        ? null
        : catalogLabel({ labelJa: definition.categoryLabelJa, labelEn }, locale),
      facets: [view],
    })
  })
  return categories.filter((category) =>
    category.facets.some((facet) => facet.values.length > 0 || facet.range !== null))
}
