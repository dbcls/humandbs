import { presenceAction } from "~/admin/pages.server"

import type { Route } from "./+types/admin-draft-presence"

/**
 * The heartbeat of an open editor.
 *
 * It answers with everybody the draft currently has open, so announcing
 * yourself and finding out who else is here are one request rather than two.
 * Nothing here is read for correctness — saving is checked against a revision,
 * not against this — so a heartbeat that is lost costs one interval.
 */
export async function action({ request, params }: Route.ActionArgs) {
  return presenceAction(request, params)
}
