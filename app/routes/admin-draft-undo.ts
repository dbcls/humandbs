import { undoSnapshotLoader } from "~/admin/pages.server"

import type { Route } from "./+types/admin-draft-undo"

/**
 * One entry of a draft's undo stack.
 *
 * It is fetched rather than carried by the page because the stack holds ten
 * whole drafts and an editor needs at most one of them — and only if somebody
 * asks. **Reading it changes nothing**: putting it back is an ordinary save,
 * which is what keeps restoring from being a way around the revision check.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  return undoSnapshotLoader(request, params)
}
