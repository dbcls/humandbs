/**
 * Reading and editing the facet conditions inside a query.
 *
 * The panel does not keep a state of its own beside the address: every value it
 * draws is a link to the same search with one condition added or taken away.
 * That is what makes it work with JavaScript turned off, and it is why this is
 * a function from a tree to a tree rather than a form.
 *
 * **What the panel can read is the facet conditions standing in the top-level
 * AND**, either alone or as an OR of values of one field. A condition buried
 * inside a negation or a nested group is left exactly as it was found and shown
 * as a chip instead: the panel would otherwise have to claim a checkbox stands
 * for something it cannot put back.
 *
 * Several values of one facet are an OR, and different facets are an AND. That
 * follows from what a count means — the values of one facet are alternatives,
 * and two facets are two questions.
 */

import { group, OPEN_BOUND, type DslRange, type FieldNode, type QueryNode } from "./dsl"
import type { QueryFields } from "./fields"

export interface Selection {
  /** Facet key code to the term codes chosen under it, in the written order. */
  terms: ReadonlyMap<string, string[]>
  /** Facet key code to the range chosen under it. */
  ranges: ReadonlyMap<string, DslRange>
}

interface Decomposed {
  /** Everything the panel does not touch, in its original order. */
  others: QueryNode[]
  /** Facet key code to the conditions on it, in the order they were written. */
  facets: Map<string, FieldNode[]>
}

/** The rules of a top-level AND, or the single node standing on its own. */
function conjuncts(ast: QueryNode | null): QueryNode[] {
  if (ast === null) return []
  return ast.op === "AND" ? [...ast.rules] : [ast]
}

function isField(node: QueryNode): node is FieldNode {
  return node.op === "field"
}

/** The field every arm names, or null when they disagree. */
function commonField(rules: readonly FieldNode[]): string | null {
  const [first] = rules
  if (first === undefined) return null
  return rules.every((rule) => rule.field === first.field) ? first.field : null
}

function decompose(ast: QueryNode | null, fields: QueryFields): Decomposed {
  const others: QueryNode[] = []
  const facets = new Map<string, FieldNode[]>()
  const take = (field: string, nodes: FieldNode[]) => {
    facets.set(field, [...(facets.get(field) ?? []), ...nodes])
  }

  for (const rule of conjuncts(ast)) {
    if (rule.op === "field" && fields.facet(rule.field) !== undefined) {
      take(rule.field, [rule])
      continue
    }
    if (rule.op === "OR") {
      const arms = rule.rules.filter(isField)
      const field = arms.length === rule.rules.length ? commonField(arms) : null
      if (field !== null && fields.facet(field) !== undefined) {
        take(field, arms)
        continue
      }
    }
    others.push(rule)
  }
  return { others, facets }
}

/**
 * The tree the parts stand for. The order is kept — what was not a facet stays
 * in front, and the facets follow in the order they were first written — so
 * that adding a value and taking it away again lands on the address it started
 * from.
 */
function recompose(parts: Decomposed): QueryNode | null {
  const groups = [...parts.facets.values()]
    .flatMap((nodes) => {
      const joined = group("OR", nodes)
      return joined === null ? [] : [joined]
    })
  return group("AND", [...parts.others, ...groups])
}

export function readSelection(ast: QueryNode | null, fields: QueryFields): Selection {
  const { facets } = decompose(ast, fields)
  const terms = new Map<string, string[]>()
  const ranges = new Map<string, DslRange>()
  for (const [field, nodes] of facets) {
    const chosen = nodes.flatMap((node) => (typeof node.value === "string" ? [node.value] : []))
    if (chosen.length > 0) terms.set(field, chosen)
    const [only] = nodes
    if (nodes.length === 1 && only !== undefined && typeof only.value !== "string") {
      ranges.set(field, only.value)
    }
  }
  return { terms, ranges }
}

function termNode(field: string, value: string): FieldNode {
  return { op: "field", field, valueKind: "term", value }
}

/**
 * Adds a value to a facet, or takes it away when it is already there. One link
 * does both, because the panel draws a chosen value the same way it draws an
 * unchosen one — as somewhere to go.
 */
export function toggleTerm(
  ast: QueryNode | null,
  fields: QueryFields,
  field: string,
  value: string,
): QueryNode | null {
  const parts = decompose(ast, fields)
  const held = parts.facets.get(field) ?? []
  const without = held.filter((node) => node.value !== value)
  const next = without.length === held.length ? [...held, termNode(field, value)] : without
  if (next.length === 0) parts.facets.delete(field)
  else parts.facets.set(field, next)
  return recompose(parts)
}

/**
 * The same search with this value asked for, whether or not it already was.
 *
 * Unlike toggling, this is what a typed code means: someone who writes a code
 * that is already in force is asking for it, not asking for it to be dropped.
 */
export function withTerm(
  ast: QueryNode | null,
  fields: QueryFields,
  field: string,
  value: string,
): QueryNode | null {
  const parts = decompose(ast, fields)
  const held = parts.facets.get(field) ?? []
  if (held.some((node) => node.value === value)) return recompose(parts)
  parts.facets.set(field, [...held, termNode(field, value)])
  return recompose(parts)
}

/** The same search with nothing asked of this facet. */
export function withoutFacet(
  ast: QueryNode | null,
  fields: QueryFields,
  field: string,
): QueryNode | null {
  const parts = decompose(ast, fields)
  parts.facets.delete(field)
  return recompose(parts)
}

/**
 * Replaces the range on a numeric facet. Both ends open means the facet is not
 * being asked about at all, so the condition goes away rather than becoming one
 * that matches everything.
 */
export function withRange(
  ast: QueryNode | null,
  fields: QueryFields,
  field: string,
  range: DslRange,
): QueryNode | null {
  // A field the catalog does not name has no control on the panel either, so a
  // request naming one is answered with the search it already was.
  if (fields.facet(field) === undefined) return ast
  const parts = decompose(ast, fields)
  if (range.from === OPEN_BOUND && range.to === OPEN_BOUND) parts.facets.delete(field)
  else parts.facets.set(field, [{ op: "field", field, valueKind: "range", value: range }])
  return recompose(parts)
}
