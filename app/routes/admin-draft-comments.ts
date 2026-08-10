import { readLocale } from "~/public/urls"
import { reviewAction } from "~/review/review.server"

import type { Route } from "./+types/admin-draft-comments"

/**
 * What an open editor posts a comment to.
 *
 * It answers with the draft's threads rather than a redirect: the editing
 * screens hold work that has not been saved, and a redirect would navigate away
 * from it. The review screen posts the same intents to its own page.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return reviewAction(request, locale, params, "threads")
}
