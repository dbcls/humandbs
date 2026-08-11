import { commonUploadAction } from "~/files/pages.server"

import type { Route } from "./+types/admin-contents-files-upload"

/**
 * Where the `common/` box asks for the signatures of one upload.
 *
 * **No bytes come through here**, the same as for a research's box. What
 * differs is where they land: this box is public, so an upload is a change to
 * what readers can fetch and is written into the audit trail.
 *
 * It has no language prefix: nothing it answers with is interface text.
 */
export async function action({ request }: Route.ActionArgs) {
  return commonUploadAction(request)
}
