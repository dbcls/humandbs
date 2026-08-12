import { datasetExportTable } from "~/public/lists.server"
import { readLocale } from "~/public/urls"
import { exportResponse } from "~/search/export"

import type { Route } from "./+types/dataset-export"

/** The dataset listing as a file. The research listing's twin. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const format = url.searchParams.get("format") === "copy" ? "copy" : "csv"
  const table = await datasetExportTable({ locale, url })
  // The listing answers an unreadable `?q=` by saying so; a file cannot, so it
  // refuses rather than handing over a different search than the one asked for.
  if (table === null) throw new Response(null, { status: 400 })
  return exportResponse(table, "dataset-list", format)
}
