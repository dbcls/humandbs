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
import type { FacetDefinition } from "~/search/catalog.server"
import { resolveTerms } from "~/search/catalog.server"
import {
  countTermChildren,
  countTerms,
  numberBounds,
  type ChildCount,
  type TermCount,
} from "~/search/counts.server"
import { OPEN_BOUND, serializeQuery, type DslRange, type QueryNode } from "~/search/dsl"
import type { QueryFields } from "~/search/fields"
import type { SearchTarget } from "~/search/query.server"
import { readSelection, toggleTerm, withoutFacet } from "~/search/selection"

import { href, listPath, searchQuery } from "./urls"

/** How many values a facet shows before the reader has to open it. */
export const PANEL_VALUES = 10

export interface FacetValueView {
  code: string
  label: string
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
  /** The span present in the result, as a hint for the inputs. */
  min: number | null
  max: number | null
  unit: string | null
  /** The search with this range lifted, or null when none is set. */
  clearHref: string | null
}

export interface FacetView {
  code: string
  label: string
  kind: "vocabulary" | "number"
  values: FacetValueView[]
  /** The address that shows every value of this facet, or null when all are shown. */
  moreHref: string | null
  /** Set on the facet named by `?facet=`. */
  expanded: boolean
  /** The address without this facet opened. Only on the expanded one. */
  closeHref: string | null
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
  /** The search with every facet condition lifted; null when none is set. */
  clearHref: string | null
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
      page: 1,
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

  const [shared, perFacet, sharedBounds, perFacetBounds, children] = await Promise.all([
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
  ])

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
      return {
        code: termCode,
        label: row !== undefined
          ? catalogLabel(row, locale)
          : term === undefined ? termCode : catalogLabel(term, locale),
        count: row?.count ?? 0,
        selected,
        href: address(toggleTerm(ast, fields, code, termCode)),
        children: row === undefined ? [] : childrenOf(children, one, row, locale, ast, fields, address),
      }
    }

    // The chosen values come first so that opening a facet never pushes one of
    // them below the cut, where it could not be taken off again.
    const picked = chosen.map((termCode) => valueOf(termCode, byCode.get(termCode), true))
    const rest = found
      .filter((row) => !chosen.includes(row.code))
      .map((row) => valueOf(row.code, row, false))
    const all = [...picked, ...rest]

    const shown = expanded
      ? all
          .filter((value) =>
            matches(find, value) || value.children.some((child) => matches(find, child)))
          .map((value) => (matches(find, value)
            ? value
            : { ...value, children: value.children.filter((child) => matches(find, child)) }))
      : [...picked, ...rest.slice(0, Math.max(0, PANEL_VALUES - picked.length))]

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

  const anySelected = selection.terms.size > 0 || selection.ranges.size > 0
  const cleared = definitions.reduce<QueryNode | null>(
    (tree, one) => withoutFacet(tree, fields, one.field.code),
    ast,
  )

  return {
    categories: categorise(views, definitions, locale),
    clearHref: anySelected ? address(cleared, { facet: null, find: "" }) : null,
    target,
  }
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
      count: child.count,
      selected: false,
      href: address(toggleTerm(ast, fields, definition.field.code, child.code)),
      children: [],
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
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
    min: span?.min ?? null,
    max: span?.max ?? null,
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
    categories.push({
      code,
      label: code === null
        ? null
        : catalogLabel(
            { labelJa: definition.categoryLabelJa, labelEn: definition.categoryLabelEn ?? code },
            locale,
          ),
      facets: [view],
    })
  })
  return categories.filter((category) =>
    category.facets.some((facet) => facet.values.length > 0 || facet.range !== null))
}
