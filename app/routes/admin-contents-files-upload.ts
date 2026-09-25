import { commonUploadAction } from "~/files/pages.server"

import type { Route } from "./+types/admin-contents-files-upload"

/**
 * Where the signatures of one upload to the `common/` prefix are requested.
 *
 * **No bytes come through here**, the same as for a research's prefix. What
 * differs is where they land: this prefix is public, so an upload is a change to
 * what readers can fetch and is written into the audit trail.
 *
 * It has no language prefix: nothing it responds with is interface text.
 */
export async function action({ request }: Route.ActionArgs) {
  return commonUploadAction(request)
}
