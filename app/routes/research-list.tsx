import { FacetPanel } from "~/components/facets"
import { ResearchListTable } from "~/components/research"
import { ListingScreen } from "~/components/search"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { canonicalRedirect, researchListPage } from "~/public/lists.server"
import { readLocale } from "~/public/urls"

import type { Route } from "./+types/research-list"

/**
 * The research listing: the public search over the research rows.
 *
 * A row matches on its own text and on the text of every dataset below it, so
 * a term written into an analysis method finds the study it belongs to. What
 * the row shows is the latest published version, which is also what the row's
 * text was derived from. The row itself is `components/research.tsx`'s
 * `ResearchListTable`, which the editing screen also draws for a draft.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const canonical = await canonicalRedirect(url, "research", locale)
  if (canonical !== null) throw canonical
  return researchListPage({ locale, url })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [messages.search.researchList]) }]
}

export default function ResearchList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  return (
    <ListingScreen
      view={view}
      target="research"
      heading={messages.search.researchList}
      panel={(
        <FacetPanel
          locale={locale}
          target="research"
          query={view.query}
          presented={{ sort: view.requestedSort, order: view.requestedOrder, size: view.requestedSize }}
          panel={view.facets}
        />
      )}
      empty={view.rows.length === 0}
    >
      <ResearchListTable rows={view.rows} locale={locale} whenEmpty={messages.search.none} />
    </ListingScreen>
  )
}
