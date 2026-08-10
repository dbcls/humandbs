/**
 * The query language: the written form on one side, the tree on the other.
 *
 * The tree is what everything in the search speaks. The keyword box builds one,
 * the address carries one written out, and the compiler reads one — so a facet
 * selection and a query written by hand meet as the same kind of value instead
 * of as two paths that have to agree.
 *
 * The written form is the Lucene subset the ddbj-search-api db-portal endpoint
 * defines, so a reader who knows one portal's queries knows this one's:
 * `field:value`, `"a phrase"`, `[a TO b]`, `value*`, `AND` / `OR` / `NOT` in
 * capitals, and `(...)`. Boost, fuzzy and regular expressions are not part of
 * it, and a bare wildcard is refused rather than run.
 *
 * Two things differ from db-portal, both because the index underneath is an
 * n-gram rather than an analyser:
 *
 * - **there is no phrase flag.** A value is matched as the literal run of
 *   characters it is, so `"Homo sapiens"` and `Homo sapiens` differ only in
 *   whether the space is inside one value or between two. Quoting is how a
 *   value containing spaces or punctuation is written down, nothing more
 *   — which is why `NGS(Exome)` survives the round trip
 * - **free text may appear anywhere.** It compiles to an ordinary predicate, so
 *   there is nothing to keep it out of an `OR` or a `NOT`
 *
 * Juxtaposition means `AND`, and an `AND` of plain words is written back
 * without the word `AND`, so the common query reads in the address exactly as
 * it was typed.
 */

import { operatorFor, type QueryFields, type ValueKind } from "./fields"

/**
 * The two ends of a range. `*` is an end that is not there, which is how one
 * side of a numeric filter is left open; a date range has to name both.
 */
export interface DslRange {
  from: string
  to: string
}

export const OPEN_BOUND = "*"

export interface FreeTextNode {
  op: "free_text"
  value: string
}

export interface FieldNode {
  op: "field"
  field: string
  valueKind: ValueKind
  value: string | DslRange
}

export interface BoolNode {
  op: "AND" | "OR" | "NOT"
  rules: QueryNode[]
}

export type QueryNode = FreeTextNode | FieldNode | BoolNode

export type QueryErrorCode
  = | "unexpected-token"
    | "unknown-field"
    | "invalid-operator-for-field"
    | "invalid-date-format"
    | "invalid-number-format"
    | "missing-value"
    | "too-complex"

export interface QueryError {
  code: QueryErrorCode
  /** 1-based, so it can be pointed at in the written form. */
  column: number
  /** The token the failure is about, when there is one. */
  token?: string
}

export type ParseResult
  = | { ok: true, ast: QueryNode | null }
    | { ok: false, error: QueryError }

const MAX_DEPTH = 16
const MAX_NODES = 200

/** A run of characters that ends a bare token. Mirrors the db-portal grammar. */
const TOKEN_BREAK = /[\s:()[\]"'{}^~/\\]/
const WILDCARD_TOKEN = /^[A-Za-z0-9_\-.]*[*?][A-Za-z0-9_\-.]*$/
const DATE_TOKEN = /^\d{4}-\d{2}-\d{2}$/
const RANGE_TOKEN = /^\[([^\s\]]+)\s+TO\s+([^\s\]]+)\]/

class ParseFailure extends Error {
  constructor(readonly error: QueryError) {
    super(error.code)
  }
}

function fail(code: QueryErrorCode, column: number, token?: string): never {
  throw new ParseFailure(token === undefined ? { code, column } : { code, column, token })
}

type Token
  = | { kind: "word" | "phrase" | "wildcard", value: string, column: number }
    | { kind: "range", value: DslRange, column: number }
    | { kind: "and" | "or" | "not" | "open" | "close" | "colon", column: number }

const OPERATOR_WORDS = new Map<string, "and" | "or" | "not">([
  ["AND", "and"],
  ["OR", "or"],
  ["NOT", "not"],
])

function readPhrase(input: string, start: number): { value: string, next: number } {
  const quote = input.charAt(start)
  let value = ""
  let i = start + 1
  while (i < input.length) {
    const char = input.charAt(i)
    const escaped = input[i + 1]
    if (char === "\\" && escaped !== undefined) {
      value += escaped
      i += 2
      continue
    }
    if (char === quote) return { value, next: i + 1 }
    value += char
    i += 1
  }
  fail("unexpected-token", start + 1)
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const char = input.charAt(i)
    if (/\s/.test(char)) {
      i += 1
      continue
    }
    const column = i + 1
    if (char === "(") {
      tokens.push({ kind: "open", column })
      i += 1
      continue
    }
    if (char === ")") {
      tokens.push({ kind: "close", column })
      i += 1
      continue
    }
    if (char === ":") {
      tokens.push({ kind: "colon", column })
      i += 1
      continue
    }
    if (char === "\"" || char === "'") {
      const { value, next } = readPhrase(input, i)
      tokens.push({ kind: "phrase", value, column })
      i = next
      continue
    }
    if (char === "[") {
      const matched = RANGE_TOKEN.exec(input.slice(i))
      const [whole, from, to] = matched ?? []
      if (whole === undefined || from === undefined || to === undefined) {
        fail("unexpected-token", column)
      }
      tokens.push({ kind: "range", value: { from, to }, column })
      i += whole.length
      continue
    }

    let end = i
    while (end < input.length && !TOKEN_BREAK.test(input.charAt(end))) end += 1
    if (end === i) fail("unexpected-token", column, char)
    const raw = input.slice(i, end)
    i = end

    const operator = OPERATOR_WORDS.get(raw)
    if (operator !== undefined) {
      tokens.push({ kind: operator, column })
      continue
    }
    if (raw.includes("*") || raw.includes("?")) {
      if (!WILDCARD_TOKEN.test(raw)) fail("unexpected-token", column, raw)
      tokens.push({ kind: "wildcard", value: raw, column })
      continue
    }
    tokens.push({ kind: "word", value: raw, column })
  }
  return tokens
}

function isRealDate(value: string): boolean {
  if (!DATE_TOKEN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * A wildcard has to keep at least two literal characters in front of it. A
 * leading one asks the index to walk every term there is, and the shortest
 * prefixes come to the same thing.
 */
function checkWildcard(value: string, column: number): void {
  const at = value.search(/[*?]/)
  if (at < 2) fail("invalid-operator-for-field", column, value)
}

function isNumber(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value))
}

/** One end of a range, checked against what the field's type admits. */
function checkBound(type: "date" | "number", value: string, column: number): void {
  if (value === OPEN_BOUND) {
    // A date range is a pair of days; leaving one end open would mean "before
    // the data begins", which the rows have no way to answer.
    if (type === "date") fail("invalid-date-format", column)
    return
  }
  if (type === "date" && !isRealDate(value)) fail("invalid-date-format", column)
  if (type === "number" && !isNumber(value)) fail("invalid-number-format", column)
}

function fieldClause(field: string, token: Token, column: number, fields: QueryFields): FieldNode {
  const type = fields.typeOf(field)
  if (type === undefined) fail("unknown-field", column, field)

  if (token.kind === "range") {
    if (operatorFor(type, "range") === null) fail("invalid-operator-for-field", column, field)
    const bound = type === "number" ? "number" : "date"
    checkBound(bound, token.value.from, token.column)
    checkBound(bound, token.value.to, token.column)
    return { op: "field", field, valueKind: "range", value: token.value }
  }
  if (token.kind !== "word" && token.kind !== "phrase" && token.kind !== "wildcard") {
    fail("missing-value", column, field)
  }

  const value = token.value
  if (value === "") fail("missing-value", column, field)
  const kind: ValueKind = token.kind === "wildcard"
    ? "wildcard"
    : DATE_TOKEN.test(value) ? "date" : "term"
  if (operatorFor(type, kind) === null) fail("invalid-operator-for-field", column, field)
  if (kind === "wildcard") checkWildcard(value, token.column)
  if (type === "date" && !isRealDate(value)) fail("invalid-date-format", token.column)
  if (type === "number" && !isNumber(value)) fail("invalid-number-format", token.column)

  return { op: "field", field, valueKind: kind, value }
}

/**
 * A group of one is the same query without the group, and a group inside a
 * group of the same operator is the same query flattened. Both hold whoever
 * built the tree — the parser, the keyword box, a facet selection — so the
 * written form and the tree stay in step through a round trip.
 */
function joined(op: "AND" | "OR", first: QueryNode, rest: readonly QueryNode[]): QueryNode {
  if (rest.length === 0) return first
  return { op, rules: [first, ...rest].flatMap((rule) => (rule.op === op ? rule.rules : [rule])) }
}

export function group(op: "AND" | "OR", rules: readonly QueryNode[]): QueryNode | null {
  const [first, ...rest] = rules
  return first === undefined ? null : joined(op, first, rest)
}

function startsAtom(token: Token | undefined): boolean {
  return token !== undefined
    && (token.kind === "word" || token.kind === "phrase" || token.kind === "open"
      || token.kind === "not" || token.kind === "wildcard")
}

class Parser {
  private at = 0
  private nodes = 0

  constructor(private readonly tokens: Token[], private readonly fields: QueryFields) {}

  private peek(): Token | undefined {
    return this.tokens[this.at]
  }

  private take(): Token {
    const token = this.tokens[this.at]
    if (token === undefined) fail("unexpected-token", this.endColumn())
    this.at += 1
    return token
  }

  private endColumn(): number {
    const last = this.tokens[this.tokens.length - 1]
    return last === undefined ? 1 : last.column
  }

  private count(): void {
    this.nodes += 1
    if (this.nodes > MAX_NODES) fail("too-complex", 1)
  }

  parse(): QueryNode {
    const node = this.or(0)
    const rest = this.peek()
    if (rest !== undefined) fail("unexpected-token", rest.column)
    return node
  }

  private or(depth: number): QueryNode {
    const first = this.and(depth)
    const rest: QueryNode[] = []
    while (this.peek()?.kind === "or") {
      this.at += 1
      rest.push(this.and(depth))
    }
    if (rest.length > 0) this.count()
    return joined("OR", first, rest)
  }

  private and(depth: number): QueryNode {
    const first = this.not(depth)
    const rest: QueryNode[] = []
    for (;;) {
      const token = this.peek()
      if (token?.kind === "and") {
        this.at += 1
        rest.push(this.not(depth))
        continue
      }
      // Juxtaposition is AND: `cancer title:x` needs no operator between them.
      if (startsAtom(token)) {
        rest.push(this.not(depth))
        continue
      }
      break
    }
    if (rest.length > 0) this.count()
    return joined("AND", first, rest)
  }

  private not(depth: number): QueryNode {
    if (this.peek()?.kind !== "not") return this.atom(depth)
    this.at += 1
    this.count()
    return { op: "NOT", rules: [this.not(depth)] }
  }

  private atom(depth: number): QueryNode {
    if (depth >= MAX_DEPTH) fail("too-complex", this.peek()?.column ?? 1)
    const token = this.take()
    this.count()

    if (token.kind === "open") {
      const inner = this.or(depth + 1)
      const close = this.peek()
      if (close?.kind !== "close") fail("unexpected-token", close?.column ?? this.endColumn())
      this.at += 1
      return inner
    }
    if (token.kind === "phrase") return { op: "free_text", value: token.value }
    if (token.kind === "word") {
      if (this.peek()?.kind === "colon") {
        this.at += 1
        return fieldClause(token.value, this.take(), token.column, this.fields)
      }
      return { op: "free_text", value: token.value }
    }
    // A bare wildcard would scan every term in the index; a field-scoped one
    // has a place to start from.
    fail("unexpected-token", token.column, token.kind === "wildcard" ? token.value : undefined)
  }
}

/**
 * An empty query is not an error — it is the whole published set.
 *
 * The fields have to be handed in because the catalog decides most of them
 * ([fields.ts](fields.ts)). **Values are not checked against the vocabulary**:
 * a code that names no term is a query that matches nothing, which is the
 * honest answer and keeps this module free of the database.
 */
export function parseQuery(input: string, fields: QueryFields): ParseResult {
  try {
    const tokens = tokenize(input)
    if (tokens.length === 0) return { ok: true, ast: null }
    return { ok: true, ast: new Parser(tokens, fields).parse() }
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, error: error.error }
    throw error
  }
}

const NEEDS_QUOTE = /[\s:()[\]"'{}^~/\\*?]/

function quote(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`
}

function writeValue(value: string, kind: ValueKind = "term"): string {
  if (kind === "wildcard") return value
  if (value === "" || NEEDS_QUOTE.test(value) || OPERATOR_WORDS.has(value)) return quote(value)
  return value
}

function precedence(node: QueryNode): number {
  if (node.op === "OR") return 0
  if (node.op === "AND") return 1
  if (node.op === "NOT") return 2
  return 3
}

function wrap(node: QueryNode, parent: number): string {
  const written = serializeQuery(node)
  return precedence(node) < parent ? `(${written})` : written
}

export function serializeQuery(node: QueryNode | null): string {
  if (node === null) return ""
  if (node.op === "free_text") return writeValue(node.value)
  if (node.op === "field") {
    const value = typeof node.value === "string"
      ? writeValue(node.value, node.valueKind)
      : `[${node.value.from} TO ${node.value.to}]`
    return `${node.field}:${value}`
  }
  if (node.op === "NOT") {
    const [only] = node.rules
    return only === undefined ? "" : `NOT ${wrap(only, 3)}`
  }
  if (node.op === "OR") return node.rules.map((rule) => wrap(rule, 0)).join(" OR ")
  // An AND of plain words is written the way it was typed.
  const separator = node.rules.every((rule) => rule.op === "free_text") ? " " : " AND "
  return node.rules.map((rule) => wrap(rule, 1)).join(separator)
}

/**
 * Whether anything in the query is matched against the full text. Only that
 * carries a score, so a query without it has nothing to rank by and relevance
 * is not offered as an ordering.
 */
export function hasFreeText(node: QueryNode | null): boolean {
  if (node === null) return false
  if (node.op === "free_text") return true
  if (node.op === "field") return false
  return node.rules.some(hasFreeText)
}
