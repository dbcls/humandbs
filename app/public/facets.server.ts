/**
 * The panel the two listings refine themselves with.
 *
 * **Every value is a link, and the address is the whole of the state.** There
 * is no form to submit and nothing to remember between requests, which is what
 * makes the panel work with JavaScript turned off and a refined result
 * shareable by copying the address. Choosing a value and unchoosing it are the
 * same link, because both are just "the search with this condition toggled".
 *
 * What the panel shows of a facet is the ten commonest values. The rest are one
 * link away, at the same address with `?facet=` naming the key — a vocabulary
 * can hold thousands of values and none of them can be worth sending on every
 * search. Only the expanded facet has a box of its own.
 *
 * Counts come from [counts.server.ts](../search/counts.server.ts), which is
 * where the rule that a facet is counted with its own condition lifted lives.
 */

import type { Executor } from "~/db/client.server"
import { icd10Resolve } from "~/icd10/codes"
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

/** How many values a facet shows before the reader has to open it. */
export const PANEL_VALUES = 10

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
  values: FacetValueView[]
  /** The address that shows every value of this facet, or null when all are shown. */
  moreHref: string | null
  /** Set on the facet named by `?facet=`. */
  expanded: boolean
  /** The address without this facet opened. Only on the expanded one. */
  closeHref: string | null
  /**
   * The address with this facet's own conditions dropped, or null when it has
   * none. **How many values are chosen is not said** — the number beside a
   * value is how many rows it leaves, and a second number in the same panel
   * counting something else is read as one of those.
   */
  clearHref: string | null
  /** What the expanded facet's own box holds. */
  find: string
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
  /** `?facet=`: the key whose values are shown in full. */
  expanded: string | null
  /** `?find=`: what was typed into the expanded facet's box. */
  find: string
  /**
   * The calendar day the relative windows are measured back from, `YYYY-MM-DD`.
   * Passed in rather than read from the clock so that the panel a request gets
   * is decided entirely by the request.
   */
  today: string
}

/** A value is looked for by its code and its label, in whichever language. */
function matches(find: string, value: { code: string, label: string }): boolean {
  if (find === "") return true
  const needle = find.toLowerCase()
  return value.code.toLowerCase().includes(needle) || value.label.toLowerCase().includes(needle)
}

/**
 * What the box of an expanded disease facet is looking for.
 *
 * **A code is rolled up to the one the panel offers.** Only the roots of the
 * classification are listed, while what an article writes — and therefore what
 * a reader has in hand — is the code below it: `C340` has to find `C34`, or the
 * box says the facet holds nothing about a disease the data does carry
 * (`docs/public-pages.md` の「絞り込み」). The point and the case are the
 * writer's, so they are not asked about either.
 *
 * **Anything not shaped like a code is looked for as it was typed**, which is
 * what keeps the same box working for a word in either language.
 */
function rolledUpFind(find: string, values: readonly FacetValueView[]): string {
  const held = new Set(values.map((value) => value.code))
  return icd10Resolve(find, (code) => held.has(code)) ?? find
}

export async function facetPanel(
  db: Executor,
  request: FacetPanelRequest,
): Promise<FacetPanelView> {
  const { ast, fields, definitions, locale, target } = request
  const selection = readSelection(ast, fields)
  const chosenTerms = (code: string): string[] => selection.terms.get(code) ?? []

  const address = (query: QueryNode | null, opts?: { facet?: string | null, find?: string }) =>
    href(locale, listPath(target) + searchQuery({
      q: serializeQuery(query),
      sort: request.sort,
      order: request.order,
      page: 1,
      size: request.size,
      facet: opts?.facet === undefined ? request.expanded : opts.facet,
      find: opts?.find ?? (request.find === "" ? null : request.find),
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
    const expanded = request.expanded === code
    const label = catalogLabel(one, locale)
    const find = expanded ? request.find : ""
    const shell = {
      code,
      label,
      kind: one.field.kind,
      expanded,
      find,
      closeHref: expanded ? address(ast, { facet: null, find: "" }) : null,
      clearHref: selection.terms.has(code) || selection.ranges.has(code)
        ? address(withoutFacet(ast, fields, code))
        : null,
    }
    const empty = { ...shell, values: [], moreHref: null, range: null }
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

    // The chosen values come first so that opening a facet never pushes one of
    // them below the cut, where it could not be taken off again.
    const taken = chosen.map((termCode) => valueOf(termCode, byCode.get(termCode), true))
    const rest = found
      .filter((row) => !chosen.includes(row.code))
      .map((row) => valueOf(row.code, row, false))
    const all = [...taken, ...rest]

    const needle = one.field.kind === "disease" ? rolledUpFind(find, all) : find
    const shown = expanded
      ? all.filter((value) => matches(needle, value))
      : [...taken, ...rest.slice(0, Math.max(0, PANEL_VALUES - taken.length))]

    return {
      ...empty,
      values: shown,
      moreHref: !expanded && all.length > shown.length
        ? address(ast, { facet: code, find: "" })
        : null,
    }
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
    moreHref: null,
    expanded: false,
    closeHref: null,
    clearHref: chosen === undefined ? null : lifted,
    find: "",
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
  // **The expanded facet is drawn whatever its box left.** It holds the box,
  // what was typed into it and the way back out; dropping it because the search
  // matched nothing would leave the reader at an address with no control on the
  // page that can undo it.
  return categories.filter((category) =>
    category.facets.some((facet) =>
      facet.values.length > 0 || facet.range !== null || facet.expanded))
}
