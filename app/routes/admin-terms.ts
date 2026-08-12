import { findTerms } from "~/admin/queries.server"
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
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireCapability(request, "edit-content")
  const url = new URL(request.url)
  const setId = url.searchParams.get("set")
  if (setId === null) return []
  return findTerms(getDb(), setId, url.searchParams.get("q") ?? "")
}
