/**
 * What an error looks like on the JSON API.
 *
 * RFC 7807 problem details, spelled the way ddbj-search-api spells them. The two
 * APIs are read by the same people, and a second convention for the same thing
 * would be one more thing for a consumer to special-case.
 *
 * **A 404 says nothing about what was asked for.** The detail is fixed per kind
 * of resource and never repeats the label, because the public side does not
 * distinguish "not published" from "no such label"
 * (docs/public-pages.md の「何を根拠に『公開されている』と言うか」) and a detail
 * quoting the label back would give that distinction away in the body even
 * though the status hides it.
 *
 * A validation failure answers 422 rather than 400: what went wrong is the shape
 * of a parameter, and the query a caller wrote is their own input, so quoting it
 * back gives nothing away.
 */

const PROBLEM_BASE = "https://humandbs.dbcls.jp/problems/"

export interface Problem {
  type: string
  title: string
  status: number
  detail: string
  instance: string
}

export type ProblemSlug
  = | "not-found"
    | "invalid-query"
    | "invalid-parameter"
    | "invalid-sort"
    | "unknown-accession-type"

const TITLES: Record<number, string> = {
  404: "Not Found",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
}

export function problemOf(input: {
  slug: ProblemSlug
  status: number
  detail: string
  instance: string
}): Problem {
  return {
    type: `${PROBLEM_BASE}${input.slug}`,
    title: TITLES[input.status] ?? "Error",
    status: input.status,
    detail: input.detail,
    instance: input.instance,
  }
}

/** The path an error is reported against, which is the request's own path. */
export function instanceOf(request: Request): string {
  const url = new URL(request.url)
  return `${url.pathname}${url.search}`
}

/**
 * The kinds of thing a caller can ask for by label, and the sentence each
 * answers with when it is not there.
 */
const MISSING: Record<"research" | "research-version" | "dataset", string> = {
  "research": "The requested research entry was not found.",
  "research-version": "The requested research version was not found.",
  "dataset": "The requested dataset entry was not found.",
}

export function notFound(request: Request, kind: keyof typeof MISSING): Problem {
  return problemOf({
    slug: "not-found",
    status: 404,
    detail: MISSING[kind],
    instance: instanceOf(request),
  })
}

/**
 * A query that could not be read. The rule it broke and where travel as RFC 7807
 * extension members rather than only inside the sentence, so that a client can
 * point at the character without parsing English.
 */
export interface QueryProblem extends Problem {
  code: string
  column: number
  token?: string
}

export function invalidQuery(
  request: Request,
  error: { code: string, column: number, token?: string },
): QueryProblem {
  const at = error.token === undefined ? "" : ` near "${error.token}"`
  return {
    ...problemOf({
      slug: "invalid-query",
      status: 422,
      detail: `The query could not be read: ${error.code} at column ${error.column}${at}.`,
      instance: instanceOf(request),
    }),
    ...error,
  }
}

export function invalidParameter(request: Request, name: string, detail: string): Problem {
  return problemOf({
    slug: "invalid-parameter",
    status: 422,
    detail: `${name}: ${detail}`,
    instance: instanceOf(request),
  })
}

/** An ordering the query cannot supply, which is a different failure from a typo. */
export function invalidSort(request: Request, wanted: string, offered: readonly string[]): Problem {
  return problemOf({
    slug: "invalid-sort",
    status: 422,
    detail: `"${wanted}" is not an ordering this query can be answered in. `
      + `Available: ${offered.join(", ")}.`,
    instance: instanceOf(request),
  })
}

export function unknownAccessionType(request: Request, known: readonly string[]): Problem {
  return problemOf({
    slug: "unknown-accession-type",
    status: 422,
    detail: `Unknown accession type. Known types: ${known.join(", ")}.`,
    instance: instanceOf(request),
  })
}
