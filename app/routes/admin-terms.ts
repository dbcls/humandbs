import { findDiseaseTerms, findTerms } from "~/admin/queries.server"
import { requireCapability } from "~/auth/actor.server"
import { getDb } from "~/db/client.server"

import type { Route } from "./+types/admin-terms"

/**
 * The candidates for what was typed into a vocabulary's box.
 *
 * It exists so that the weight of an editing screen does not follow the size of
 * the catalog: a vocabulary holds anything from three values to several
 * hundred, and only the handful that match is ever needed at once
 * (docs/editing.md の「編集フォーム」).
 *
 * **A disease's box asks the same question of a different reader.** What is
 * typed there is a classification code as often as a word, so it is normalised
 * and rolled up before the vocabulary is asked; the field says which reading it
 * wants rather than the endpoint guessing from the set.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireCapability(request, "edit-content")
  const url = new URL(request.url)
  const setId = url.searchParams.get("set")
  if (setId === null) return []
  const needle = url.searchParams.get("q") ?? ""
  return url.searchParams.get("kind") === "disease"
    ? findDiseaseTerms(getDb(), setId, needle)
    : findTerms(getDb(), setId, needle)
}
