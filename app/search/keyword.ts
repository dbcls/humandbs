/**
 * The search box and the tree.
 *
 * **What is typed into the box is keywords, not a query language.** The box
 * never reaches the parser: it is cut into terms here and handed over as a
 * tree. That is what lets a term keep its punctuation — `NGS(Exome)` is one
 * value with brackets in it, and the writer quotes it on the way into the
 * address rather than the reader tripping over it.
 *
 * The separators are the ones the db-portal search box uses, so the two
 * portals answer the same way to the same typing:
 *
 * - a space between terms means both (`糖尿病 ゲノム`)
 * - a comma between terms means either (`糖尿病,がん`)
 * - quotes hold a run together (`"Homo sapiens"`), which is how a term with a
 *   space in it is written
 *
 * The way back is partial on purpose. A tree can hold conditions the box has no
 * way to show — a field, a negation, a mixture of both — so the reverse
 * separates what the box can *carry* from what cannot be typed into it.
 *
 * **This is not the split between what is listed and what is not.** Everything
 * in force is listed, the typed words included (`app/public/lists.server.ts`
 * の `inForce`); what this file decides is only which of it the box can hold,
 * so that the reader can edit those words by typing rather than by lifting a
 * condition and starting again.
 */

import { group, type QueryNode } from "./dsl"

/** Splits on a separator that is not inside quotes, keeping the quotes. */
function splitOutsideQuotes(input: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = []
  let current = ""
  let quoteChar: string | null = null
  for (const char of input) {
    if (quoteChar !== null) {
      current += char
      if (char === quoteChar) quoteChar = null
      continue
    }
    if (char === "\"" || char === "'") {
      quoteChar = char
      current += char
      continue
    }
    if (isSeparator(char)) {
      parts.push(current)
      current = ""
      continue
    }
    current += char
  }
  parts.push(current)
  return parts
}

/** A term written in quotes is one value; the quotes are not part of it. */
function termValue(term: string): string {
  const first = term[0]
  if (term.length >= 2 && (first === "\"" || first === "'") && term.endsWith(first)) {
    return term.slice(1, -1)
  }
  return term
}

function termsOf(arm: string): QueryNode[] {
  return splitOutsideQuotes(arm, (char) => /\s/.test(char))
    .map(termValue)
    .filter((value) => value !== "")
    .map((value): QueryNode => ({ op: "free_text", value }))
}

/** The tree a box holding `input` stands for, or null when it holds nothing. */
export function keywordToQuery(input: string): QueryNode | null {
  const arms = splitOutsideQuotes(input, (char) => char === ",")
    .flatMap((arm) => {
      const node = group("AND", termsOf(arm))
      return node === null ? [] : [node]
    })
  return group("OR", arms)
}

export interface KeywordSplit {
  /** What the box shows. Empty when the tree holds nothing the box can carry. */
  keyword: string
  /** The conditions shown beside the box, each of which can be removed. */
  conditions: QueryNode[]
}

/**
 * A term needs quotes in the box for the same reason it does in the address.
 * Null when it needs both kinds at once, which the box has no way to write.
 */
function writeTerm(value: string): string | null {
  if (value === "" || !/[\s,"']/.test(value)) return value === "" ? null : value
  if (!value.includes("\"")) return `"${value}"`
  if (!value.includes("'")) return `'${value}'`
  return null
}

/** One arm of a comma-separated box: a term, or several meaning all of them. */
function armKeyword(node: QueryNode): string | null {
  const rules = node.op === "AND" ? node.rules : [node]
  const terms = rules.map((rule) => (rule.op === "free_text" ? writeTerm(rule.value) : null))
  return terms.every((term) => term !== null) ? terms.join(" ") : null
}

function orKeyword(rules: readonly QueryNode[]): string | null {
  const arms = rules.map(armKeyword)
  return arms.every((arm) => arm !== null) ? arms.join(",") : null
}

/**
 * Pulls out the part of a tree the box can hold. Free text at the top level
 * goes into the box; everything else becomes a condition beside it, so a query
 * that arrived through the address is visible in full even where it cannot be
 * edited by typing.
 */
export function splitKeyword(ast: QueryNode | null): KeywordSplit {
  if (ast === null) return { keyword: "", conditions: [] }

  if (ast.op === "free_text") {
    const only = writeTerm(ast.value)
    return only === null ? { keyword: "", conditions: [ast] } : { keyword: only, conditions: [] }
  }
  if (ast.op === "OR") {
    const written = orKeyword(ast.rules)
    return written === null ? { keyword: "", conditions: [ast] } : { keyword: written, conditions: [] }
  }
  if (ast.op !== "AND") return { keyword: "", conditions: [ast] }

  const free = ast.rules.filter((rule) => rule.op === "free_text")
  const rest = ast.rules.filter((rule) => rule.op !== "free_text")
  if (free.length > 0) {
    const terms = free.map((rule) => writeTerm(rule.value))
    if (terms.every((term) => term !== null)) return { keyword: terms.join(" "), conditions: rest }
    return { keyword: "", conditions: [...ast.rules] }
  }
  // A single either-or beside conditions still fits: the box writes the arms
  // with commas and the conditions stay beside it.
  const ors = rest.filter((rule) => rule.op === "OR")
  const [onlyOr] = ors
  if (ors.length === 1 && onlyOr?.op === "OR") {
    const written = orKeyword(onlyOr.rules)
    if (written !== null) {
      return { keyword: written, conditions: rest.filter((rule) => rule !== onlyOr) }
    }
  }
  return { keyword: "", conditions: rest }
}

/** The tree the box and the remaining conditions stand for together. */
export function joinKeyword(keyword: string, conditions: readonly QueryNode[]): QueryNode | null {
  const typed = keywordToQuery(keyword)
  return group("AND", typed === null ? conditions : [typed, ...conditions])
}
