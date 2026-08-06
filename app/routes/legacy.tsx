import { redirect } from "react-router"

import { href, legacyTarget, readLocale } from "~/public/urls"

import type { Route } from "./+types/legacy"

/**
 * Everything the page routes did not take.
 *
 * Two things end up here and are answered rather than refused. A bare hum
 * label, which is how DDBJ Search links to this site and therefore has to keep
 * working forever, and the addresses the old Joomla site published. Both are
 * resolved here on the server: v1 rescued them with a redirect issued by the
 * browser, which never reached a client that does not run JavaScript.
 *
 * `/ja/…` lands here too, because Japanese has no prefix. It is the same page
 * as the unprefixed address and redirects to it, so one page keeps one address.
 */
export function loader({ request }: Route.LoaderArgs) {
  const { locale, path, redundantPrefix } = readLocale(new URL(request.url).pathname)
  if (redundantPrefix) throw redirect(path)

  const target = legacyTarget(path)
  if (target !== null) throw redirect(href(locale, target))

  throw new Response(null, { status: 404, statusText: "Not Found" })
}

export default function Legacy() {
  return null
}
