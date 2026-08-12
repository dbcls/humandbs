import { researchExportTable } from "~/public/lists.server"
import { readLocale } from "~/public/urls"
import { exportResponse } from "~/search/export"

import type { Route } from "./+types/research-export"

/**
 * The research listing as a file.
 *
 * It reads the address exactly as the listing does, so what comes down is the
 * search that was on screen — every row of it, not the page being looked at.
 * The language is the one in the address, because the column headings and the
 * values are both in it.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const format = url.searchParams.get("format") === "copy" ? "copy" : "csv"
  const table = await researchExportTable({ locale, url })
  // The listing answers an unreadable `?q=` by saying so; a file cannot, so it
  // refuses rather than handing over a different search than the one asked for.
  if (table === null) throw new Response(null, { status: 400 })
  return exportResponse(table, "research-list", format)
}
