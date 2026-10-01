import { findDiseaseTerms, findTerms, findTermsInRange } from "~/admin/queries.server"
import { requireCapability } from "~/auth/actor.server"
import { getDb } from "~/db/client.server"
import { icd10Range } from "~/icd10/codes"

import type { Route } from "./+types/admin-terms"

/**
 * The candidates for what was typed into a vocabulary's box.
 *
 * It exists so that the weight of an editing screen does not follow the size of
 * the catalog: a vocabulary holds anything from three values to several
 * hundred, and only the handful that match is ever needed at once.
 *
 * **A disease's box poses the same question to a different reader.** What is
 * typed there is a classification code as often as a word, so it is normalised
 * and rolled up before the vocabulary is asked; the field reports which reading it
 * wants rather than the endpoint guessing from the set. **A disease's range is
 * asked as its two ends** (`lower` and `upper`), and responds with every code in
 * it; ends that are not a range respond with none.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireCapability(request, "edit-content")
  const url = new URL(request.url)
  const setId = url.searchParams.get("set")
  if (setId === null) return []
  const disease = url.searchParams.get("kind") === "disease"
  const lower = url.searchParams.get("lower")
  const upper = url.searchParams.get("upper")
  if (disease && lower !== null && upper !== null) {
    const range = icd10Range(lower, upper)
    return range.state === "range" ? findTermsInRange(getDb(), setId, range) : []
  }
  const needle = url.searchParams.get("q") ?? ""
  return disease
    ? findDiseaseTerms(getDb(), setId, needle)
    : findTerms(getDb(), setId, needle)
}
