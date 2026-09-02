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
 * search. Only the expanded facet has a box of its own, and only it shows what
 * sits underneath a value.
 *
 * Counts come from [counts.server.ts](../search/counts.server.ts), which is
 * where the rule that a facet is counted with its own condition lifted lives.
 */

import type { Executor } from "~/db/client.server"
import { ICD10_SET_CODE } from "~/icd10/codes"
import { resolveTypedCode } from "~/icd10/entry.server"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { makerOf } from "~/public/view.server"
import type { FacetDefinition } from "~/search/catalog.server"
import { resolveTerms } from "~/search/catalog.server"
import {
  countTermChildren,
  countTerms,
  dateBounds,
  numberBounds,
  type ChildCount,
  type DateBounds,
  type TermCount,
} from "~/search/counts.server"
import { OPEN_BOUND, serializeQuery, type DslRange, type QueryNode } from "~/search/dsl"
import { DATE_FACETS, type DateFacet, type QueryFields } from "~/search/fields"
import { messagesFor } from "~/i18n/messages"
import type { SearchTarget } from "~/search/query.server"
import { readSelection, toggleTerm, withoutFacet } from "~/search/selection"

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
  /** Only on an expanded hierarchical facet: what rolls up into this value. */
  children: FacetValueView[]
}

/**
 * The box a code is typed into, on the one facet that has one.
 *
 * A code that resolves never reaches the view — the listing answers it with a
 * redirect to the refined address, the same as the range inputs. What arrives
 * here is what could not be turned into a condition, and the two reasons are
 * kept apart because they call for different things of the reader.
 */
export interface FacetCodeEntryView {
  /** What was typed, so that the box comes back holding it. */
  value: string
  problem: "unknown-code" | "no-data" | null
}

export interface FacetRangeView {
  /** What the inputs hold; empty when that end is open. */
  from: string
  to: string
  /**
   * The span present in the result, written out, as a hint for the inputs.
   *
   * **Written here rather than at the screen** because what it takes to write a
   * number so that somebody could type it back is not the screen's to know: a
   * kilobyte held in gigabytes is 0.00000095, and the default way of writing
   * that is exponent notation, which is not a number anybody types into a box.
   */
  min: string | null
  max: string | null
  unit: string | null
  /** The search with this range lifted, or null when none is set. */
  clearHref: string | null
}

export interface FacetView {
  code: string
  label: string
  /**
   * A date takes the same pair of inputs as a number and a different keyboard,
   * which is the whole of the difference to the screen.
   */
  kind: "vocabulary" | "number" | "date"
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
  /** Set on the disease facet, whose values can also be named by code. */
  codeEntry: FacetCodeEntryView | null
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
  /** `?code=`: an ICD10 code that did not become a condition. */
  code: string
}

/** A value is looked for by its code and its label, in whichever language. */
function matches(find: string, value: { code: string, label: string }): boolean {
  if (find === "") return true
  const needle = find.toLowerCase()
  return value.code.toLowerCase().includes(needle) || value.label.toLowerCase().includes(needle)
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

  const vocabularies = definitions.filter((one) => one.field.kind === "vocabulary")
  const numbers = definitions.filter((one) => one.field.kind === "number")
  const untouched = (one: FacetDefinition) =>
    !selection.terms.has(one.field.code) && !selection.ranges.has(one.field.code)

  const icd10 = definitions.find((one) => one.setCode === ICD10_SET_CODE)
  const typed = request.code !== "" && icd10?.field.setId
    ? await resolveTypedCode(db, icd10.field.setId, request.code)
    : null
  // A code that resolved was answered with a redirect before the panel ran, so
  // anything still here is one of the two the reader has to be told about.
  const typedProblem = typed === null || typed.status === "found"
    ? null
    : typed.status === "no-data" ? "no-data" as const : "unknown-code" as const

  // The dates are counted the same way everything else is: with their own
  // condition lifted, so that a chosen span does not become the only span the
  // inputs will suggest.
  const datesChosen = DATE_FACETS.filter((field) =>
    selection.terms.has(field) || selection.ranges.has(field))

  const [shared, perFacet, sharedBounds, perFacetBounds, children, picked, dates]
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
      expandedChildren(db, request, basisFor),
      chosenChildren(db, request, basisFor, chosenTerms),
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
  // Counted at their own level rather than rolled up into a root, which is the
  // only way a chosen four-digit code can say how many rows it matches.
  const ownLevel = new Map(
    [...children, ...picked].map((row) => [`${row.keyId}/${row.code}`, row]),
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
    const empty = { ...shell, values: [], moreHref: null, range: null, codeEntry: null }
    if (one.field.kind === "number") {
      const chosenRange = selection.ranges.get(code)
      const span = bounds.get(one.field.keyId)
      // Nothing in the result carries a number under this key, and nobody is
      // asking for one: a pair of inputs over an empty facet is only noise.
      if (span === undefined && chosenRange === undefined) return empty
      return {
        ...empty,
        range: rangeView({ definition: one, chosen: chosenRange, span, ast, fields, address }),
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
        children: row === undefined ? [] : childrenOf(children, one, row, locale, ast, fields, address),
      }
    }

    // The chosen values come first so that opening a facet never pushes one of
    // them below the cut, where it could not be taken off again. A chosen value
    // that is not a root is not among the rolled-up counts, so it is looked for
    // at its own level before it is given up on.
    const chosenRow = (termCode: string): TermCount | undefined =>
      byCode.get(termCode) ?? ownLevel.get(`${one.field.keyId}/${termCode}`)
    const taken = chosen.map((termCode) => valueOf(termCode, chosenRow(termCode), true))
    const rest = found
      .filter((row) => !chosen.includes(row.code))
      .map((row) => valueOf(row.code, row, false))
    const all = [...taken, ...rest]

    const shown = expanded
      ? all
          .filter((value) =>
            matches(find, value) || value.children.some((child) => matches(find, child)))
          .map((value) => (matches(find, value)
            ? value
            : { ...value, children: value.children.filter((child) => matches(find, child)) }))
      : [...taken, ...rest.slice(0, Math.max(0, PANEL_VALUES - taken.length))]

    return {
      ...empty,
      values: shown,
      moreHref: !expanded && all.length > shown.length
        ? address(ast, { facet: code, find: "" })
        : null,
      codeEntry: one.setCode === ICD10_SET_CODE
        ? { value: request.code, problem: typedProblem }
        : null,
    }
  })

  return {
    categories: withDates(
      categorise(views, definitions, locale),
      DATE_FACETS.flatMap((field) => {
        const view = dateView({ field, locale, selection, span: dateSpan(field), ast, fields, address })
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
  ast: QueryNode | null
  fields: QueryFields
  address: (query: QueryNode | null) => string
}): FacetView | null {
  const { field, locale, selection, span, ast, fields, address } = input
  // A single day written as a condition is a span of one day. The panel has no
  // other way to draw it, and drawing nothing would leave it with no way off.
  const [only] = selection.terms.get(field) ?? []
  const chosen = selection.ranges.get(field)
    ?? (only === undefined ? undefined : { from: only, to: only })
  if (span === null && chosen === undefined) return null

  const written = (bound: string | undefined) =>
    bound === undefined || bound === OPEN_BOUND ? "" : bound
  return {
    code: field,
    label: messagesFor(locale).search.fields[field],
    kind: "date",
    values: [],
    moreHref: null,
    expanded: false,
    closeHref: null,
    clearHref: chosen === undefined ? null : address(withoutFacet(ast, fields, field)),
    find: "",
    codeEntry: null,
    range: {
      from: written(chosen?.from),
      to: written(chosen?.to),
      min: span?.min ?? null,
      max: span?.max ?? null,
      unit: null,
      clearHref: chosen === undefined ? null : address(withoutFacet(ast, fields, field)),
    },
  }
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

/**
 * The chosen values of the hierarchical facets, counted at their own level.
 *
 * `countTerms` groups by the root a value hangs under, so a reader who picked a
 * four-digit ICD10 code is not among its own rows — and a chosen value with no
 * count reads as "this matched nothing", which is a different state the panel
 * also has to be able to say. The expanded facet already has these counted.
 */
async function chosenChildren(
  db: Executor,
  request: FacetPanelRequest,
  basisFor: (code: string) => QueryNode | null,
  chosenTerms: (code: string) => string[],
): Promise<ChildCount[]> {
  const wanted = request.definitions.filter((one) =>
    one.hierarchical
    && one.field.code !== request.expanded
    && chosenTerms(one.field.code).length > 0)
  const counted = await Promise.all(wanted.map((one) => countTermChildren(
    db,
    { target: request.target, ast: basisFor(one.field.code), fields: request.fields },
    one.field.keyId,
  )))
  return counted.flat()
}

/** The values beneath the roots of the expanded facet, when it has any. */
async function expandedChildren(
  db: Executor,
  request: FacetPanelRequest,
  basisFor: (code: string) => QueryNode | null,
): Promise<ChildCount[]> {
  const one = request.definitions.find((def) => def.field.code === request.expanded)
  if (!one?.hierarchical) return []
  return countTermChildren(
    db,
    { target: request.target, ast: basisFor(one.field.code), fields: request.fields },
    one.field.keyId,
  )
}

function childrenOf(
  children: readonly ChildCount[],
  definition: FacetDefinition,
  root: TermCount,
  locale: Locale,
  ast: QueryNode | null,
  fields: QueryFields,
  address: (query: QueryNode | null) => string,
): FacetValueView[] {
  return children
    .filter((child) => child.rootId === root.termId && child.termId !== root.termId)
    .map((child) => ({
      code: child.code,
      label: catalogLabel(child, locale),
      maker: makerOf(child.maker, catalogLabel(child, locale)),
      count: child.count,
      selected: false,
      href: address(toggleTerm(ast, fields, definition.field.code, child.code)),
      children: [],
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * One end of the span present, written so that a reader could type it back.
 *
 * **The two ends are rounded outwards** — the low one down, the high one up —
 * so the pair still holds everything it describes. A hint that excluded a value
 * the reader can see in the result would be worse than no hint.
 *
 * Values are stored in the key's canonical unit, and a unit chosen for the
 * largest values makes the smallest ones very small: a kilobyte held in
 * gigabytes is 0.00000095, which `String` writes as `9.5367431640625e-7`. Two
 * significant digits below one and whole numbers above it — the span is read to
 * know what to type, not to be reproduced.
 */
export function writtenBound(value: number, towards: "down" | "up"): string {
  if (!Number.isFinite(value) || value === 0) return "0"
  const abs = Math.abs(value)
  const places = abs >= 1 ? 0 : Math.min(20, Math.ceil(-Math.log10(abs)) + 1)
  const factor = 10 ** places
  const snapped = (towards === "down" ? Math.floor : Math.ceil)(value * factor) / factor
  const [whole = "0", fraction] = Math.abs(snapped).toFixed(places).split(".")
  const grouped = Number(whole).toLocaleString("en-US")
  const sign = snapped < 0 ? "-" : ""
  return fraction === undefined ? `${sign}${grouped}` : `${sign}${grouped}.${fraction}`
}

function rangeView(input: {
  definition: FacetDefinition
  chosen: DslRange | undefined
  span: { min: number, max: number } | undefined
  ast: QueryNode | null
  fields: QueryFields
  address: (query: QueryNode | null) => string
}): FacetRangeView {
  const { definition, chosen, span } = input
  const written = (bound: string | undefined) =>
    bound === undefined || bound === OPEN_BOUND ? "" : bound
  return {
    from: written(chosen?.from),
    to: written(chosen?.to),
    min: span === undefined ? null : writtenBound(span.min, "down"),
    max: span === undefined ? null : writtenBound(span.max, "up"),
    unit: definition.canonicalUnit,
    clearHref: chosen === undefined
      ? null
      : input.address(withoutFacet(input.ast, input.fields, definition.field.code)),
  }
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
