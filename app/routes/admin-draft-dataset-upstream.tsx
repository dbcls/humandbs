import { data } from "react-router"

import { upstreamDatasetAction, upstreamDatasetPage } from "~/admin/templates.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-dataset-upstream"

/**
 * What the section under the list of a draft's datasets asks
 * (`AccessionSection`): looking an accession up, and making the dataset it
 * names. **No screen of its own** — a box and what it finds are read beside the
 * list they add to, so this address answers the section's requests and draws
 * nothing.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamDatasetPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamDatasetAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}
