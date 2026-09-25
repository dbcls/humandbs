/**
 * `NA` written where the answer is "this does not apply".
 *
 * v1 had no state for a value that does not exist, so the table's conditional
 * rows — targets "if Target Capture", sample source "if purchased" — were
 * responded with the letters `NA`. In v2 that is the not-applicable state, which
 * the page shows as such and which search and facets leave out; kept as text,
 * `NA` would be indexed and read as a value.
 *
 * Only a value that is `NA` and nothing else is turned: a value with other
 * words (`Illumina: NA`) reports something about part of the experiment, and a
 * word such as `none` handles the question ("no deduplication was done").
 */

import type { Slot } from "~/content/types"

const NOT_APPLICABLE = /^\s*(?:NA|N\/A)\s*$/

const STATES = new Set(["value", "unknown", "not-applicable"])

function isSlot(node: unknown): node is Slot<unknown> {
  return typeof node === "object" && node !== null && !Array.isArray(node)
    && STATES.has((node as { state?: unknown }).state as string)
}

function wordsOf(value: unknown): string | null {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return null
  const lines = value as unknown[]
  if (!lines.every((line) => Array.isArray(line))) return null
  return (lines as unknown[][]).map((line) => line.map((span) => (span as { text?: unknown }).text).join("")).join("\n")
}

/** The content with every `NA` value made not-applicable, and how many were. */
export function markNotApplicable<T>(content: T): { content: T, marked: number } {
  let marked = 0
  const walk = (node: unknown): unknown => {
    if (isSlot(node)) {
      if (node.state !== "value") return node
      const words = wordsOf(node.value)
      if (words === null || !NOT_APPLICABLE.test(words)) return node
      marked += 1
      return { state: "not-applicable" }
    }
    if (Array.isArray(node)) return (node as unknown[]).map(walk)
    if (typeof node !== "object" || node === null) return node
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, walk(value)]))
  }
  return { content: walk(content) as T, marked }
}
