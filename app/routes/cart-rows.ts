import { isCartable } from "~/cart/store"
import { cartRows } from "~/public/lists.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/cart-rows"

/**
 * The rows for what the cart is holding, fetched by the cart's own page.
 *
 * **The cart is in the browser, and the browser is what requests.** The page used to
 * have the collection in its address so that the server could draw the table
 * from it, which put a hundred accessions in the address bar for what is a
 * private, half-finished errand. The accessions come here in a request the
 * reader never sees instead, and `/cart` stays `/cart`.
 *
 * It responds with the same shape as the listing rows because it is the same query
 * (`cartRows`): the set of what is published comes from the search rows, so a
 * dataset that has been withdrawn simply has no row.
 *
 * **What was asked for comes back with the answer**, because that is the only
 * way the page can tell "this one was looked for and is not published" from
 * "this one was added a moment ago and has not been fetched yet".
 *
 * **Only what a cart can hold is looked up, once each** (`isCartable`): the
 * page sends nothing else, and anything else — a NUL among it — is not a JGA
 * dataset to find.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const ids = [...new Set((url.searchParams.get("ids") ?? "").split(",").filter(isCartable))]
  return { asked: ids, rows: await cartRows(ids, locale) }
}
