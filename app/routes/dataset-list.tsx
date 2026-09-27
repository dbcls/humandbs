import { CartColumnHead, CartToggle } from "~/components/cart"
import { FacetPanel } from "~/components/facets"
import { AccessTypeBadge, IdWithIcon, Table, Td, Value } from "~/components/page"
import { Experiments } from "~/components/research"
import { ListingScreen } from "~/components/search"
import { messagesFor } from "~/i18n/messages"
import { windowTitle } from "~/i18n/title"
import { canonicalRedirect, datasetListPage } from "~/public/lists.server"
import { datasetPath, href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/dataset-list"

/**
 * The dataset listing: the public search over the dataset rows.
 *
 * The dates are the ones the search row holds, which is where the archive's
 * cache and the portal's own release date have already been reconciled — the
 * listing and the dataset page cannot disagree about when something appeared.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const canonical = await canonicalRedirect(url, "dataset", locale)
  if (canonical !== null) throw canonical
  return datasetListPage({ locale, url })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [{ title: windowTitle(messages, [messages.search.datasetList]) }]
}

export default function DatasetList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const d = messages.dataset
  // **The column is always the first one**, as it is on the research listing.
  // Most datasets are not applied for at all — the archives' own accessions are
  // open — so on many pages every cell in it is empty; a column that appeared
  // and disappeared with the sort left the note above the table telling the
  // reader to press a toggle that was nowhere on the screen, and moved every
  // other column sideways between one page of results and the next.
  const headers = [
    <CartColumnHead key="cart" locale={locale} />,
    d.datasetId,
    messages.research.researchId,
    d.typeOfData,
    d.experiments,
    d.accessType,
    d.datePublished,
    d.dateModified,
  ]
  return (
    <ListingScreen
      view={view}
      target="dataset"
      heading={messages.search.datasetList}
      panel={(
        <FacetPanel
          locale={locale}
          target="dataset"
          query={view.query}
          presented={{ sort: view.requestedSort, order: view.requestedOrder, size: view.requestedSize }}
          panel={view.facets}
        />
      )}
      empty={view.rows.length === 0}
    >
      <Table headers={headers} stuck={2} whenEmpty={messages.search.none}>
        {view.rows.map((row) => (
          <tr key={row.label}>
            <Td stuck={0} holds="icon"><CartToggle ids={[row.label]} locale={locale} /></Td>
            <Td stuck={1} nowrap>
              <IdWithIcon kind="dataset" to={href(locale, datasetPath(row.label))}>{row.label}</IdWithIcon>
            </Td>
            <Td nowrap>
              <IdWithIcon kind="research" to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</IdWithIcon>
            </Td>
            <Td floor="min-w-48">
              {row.typeOfData !== null && <Value field={row.typeOfData} locale={locale} />}
            </Td>
            <Td floor="min-w-48"><Experiments labels={row.experimentLabels} locale={locale} /></Td>
            <Td>{row.accessType !== null && <AccessTypeBadge term={row.accessType} />}</Td>
            <Td nowrap>{row.datePublished}</Td>
            <Td nowrap>{row.dateModified}</Td>
          </tr>
        ))}
      </Table>
    </ListingScreen>
  )
}
