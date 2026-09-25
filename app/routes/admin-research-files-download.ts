import { fileDownload } from "~/files/pages.server"

import type { Route } from "./+types/admin-research-files-download"

/**
 * Where a row of the files screen fetches a private file. It responds with a
 * redirect to a signed address of the store, valid for a few minutes, and the
 * browser saves what that address responds with.
 *
 * It has no language prefix: nothing it responds with is interface text.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  return fileDownload(request, params.researchId)
}
