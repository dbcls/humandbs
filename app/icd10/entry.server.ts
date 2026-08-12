/**
 * What a typed ICD10 code means.
 *
 * The disease facet holds a few hundred values spread over the roots of the
 * classification, so finding one by reading the list means opening every value
 * first. A code can be written instead, and what it produces is **the same
 * condition choosing the value would have produced** — one set of semantics for
 * the rollup and one way of counting (docs/public-pages.md の「絞り込み」).
 *
 * The dictionary is what lets the three answers be told apart. Without it a
 * code nobody has ever used and a code that does not exist would both come back
 * as an empty result.
 */

import { and, eq } from "drizzle-orm"

import type { Executor } from "~/db/client.server"
import { icd10Reference, vocabularyTerm } from "~/db/schema"

import { icd10Code } from "./codes"

export type TypedCode
  /** A value of the vocabulary: the search can be refined by it. */
  = | { status: "found", code: string }
    /** A real code that no published row carries. */
    | { status: "no-data", code: string }
    /** Not a code of the classification, or not shaped like one at all. */
    | { status: "unknown" }

export async function resolveTypedCode(
  db: Executor,
  setId: string,
  typed: string,
): Promise<TypedCode> {
  const code = icd10Code(typed)
  if (code === null) return { status: "unknown" }

  const [term] = await db
    .select({ code: vocabularyTerm.code })
    .from(vocabularyTerm)
    .where(and(
      eq(vocabularyTerm.setId, setId),
      eq(vocabularyTerm.code, code),
      eq(vocabularyTerm.active, true),
    ))
    .limit(1)
  if (term !== undefined) return { status: "found", code: term.code }

  const [known] = await db
    .select({ code: icd10Reference.code })
    .from(icd10Reference)
    .where(eq(icd10Reference.code, code))
    .limit(1)
  return known === undefined ? { status: "unknown" } : { status: "no-data", code }
}
