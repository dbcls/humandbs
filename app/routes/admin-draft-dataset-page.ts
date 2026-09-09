import { datasetPageAction } from "~/admin/pages.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-dataset-page"

/**
 * One dataset of a draft drawn as its page, for the pane beside the form.
 *
 * The research's counterpart is `routes/admin-draft-page.ts`, and it is here
 * for the same reasons: it answers with the drawing rather than with a screen,
 * so it is registered once and takes its language from the request.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const url = new URL(request.url)
  const asked = url.searchParams.get("lang")
  const locale = asked === "en" || asked === "ja" ? asked : readLocale(url.pathname).locale
  return datasetPageAction(request, locale, params)
}
