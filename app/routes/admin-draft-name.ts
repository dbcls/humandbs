import { renameDraftAction } from "~/admin/pages.server"

import type { Route } from "./+types/admin-draft-name"

/**
 * What the editing screen sends a draft's name to. It responds with how it
 * went rather than a redirect: the screen holds work that has not been saved,
 * and the name is changed without leaving it.
 */
export async function action({ request, params }: Route.ActionArgs) {
  return renameDraftAction(request, params)
}
