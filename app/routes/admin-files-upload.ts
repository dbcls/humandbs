import { fileUploadAction } from "~/files/pages.server"

import type { Route } from "./+types/admin-files-upload"

/**
 * Where the box screen asks for the signatures of one upload.
 *
 * **No bytes come through here.** What is handed back accepts exactly one file —
 * this key, this content type, this many bytes — and the browser puts to it
 * directly. That signature is the whole of what can be imposed on a transfer
 * the application never sees (docs/files.md).
 *
 * It has no language prefix: nothing it answers with is interface text, and an
 * upload whose page changed language mid-transfer would otherwise be talking to
 * a second address.
 */
export async function action({ request, params }: Route.ActionArgs) {
  return fileUploadAction(request, params.researchId)
}
