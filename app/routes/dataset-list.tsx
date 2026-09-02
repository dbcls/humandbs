import { Link } from "react-router"

import { Clamped } from "~/components/base"
import { CartToggle } from "~/components/cart"
import { FacetPanel } from "~/components/facets"
import { Icon } from "~/components/icons"
import { AccessTypeBadge, Table, Td, Value } from "~/components/page"
import { ListingScreen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { canonicalRedirect, datasetListPage } from "~/public/lists.server"
import { datasetPath, href, listPath, readLocale, researchPath, searchQuery } from "~/public/urls"

import type { Route } from "./+types/dataset-list"

const SHOWN_EXPERIMENTS = 3

/**
 * What a dataset's experiments are called. **The line above the table in the
 * source article**, which is what a reader recognises the work by — the terms
 * describing the same work are what the panel counts, and they are not these.
 * A dataset holds a handful, so the cell counts the rest instead of opening
 * with them.
 */
function Experiments({ labels, locale }: { labels: string[], locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <Clamped
      shown={SHOWN_EXPERIMENTS}
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={labels.map((label) => <span key={label}>{label}</span>)}
    />
  )
}

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
  return [{ title: `${messages.search.datasetList} - ${messages.siteName}` }]
}

export default function DatasetList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const d = messages.dataset
  const onThisPage = view.rows.map((row) => row.label)
  // **The column is always the first one**, as it is on the research listing.
  // Most datasets are not applied for at all — the archives' own accessions are
  // open — so on many pages every cell in it is empty; a column that appeared
  // and disappeared with the sort left the note above the table telling the
  // reader to press a mark that was nowhere on the screen, and moved every
  // other column sideways between one page of results and the next.
  const headers = [
    <CartToggle key="cart" ids={onThisPage} locale={locale} whole />,
    d.datasetId,
    messages.research.researchId,
    d.typeOfData,
    d.experiments,
    d.accessType,
    d.datePublished,
    d.dateModified,
  ]
  const otherLink = view.otherCount === null
    ? undefined
    : (
        <Link to={href(locale, listPath("research") + searchQuery({ q: view.query, sort: null, page: 1 }))}>
          {messages.search.alsoInResearch(view.otherCount)}
        </Link>
      )

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
          sort={view.requestedSort}
          panel={view.facets}
        />
      )}
      other={otherLink}
      empty={view.rows.length === 0}
    >
      <Table headers={headers}>
        {view.rows.map((row) => (
          <tr key={row.label}>
            <Td narrow><CartToggle ids={[row.label]} locale={locale} /></Td>
            <Td nowrap>
              <Icon name="database" aria-hidden="true" className="mr-1 text-ink-muted" />
              <Link to={href(locale, datasetPath(row.label))}>{row.label}</Link>
            </Td>
            <Td nowrap>
              <Icon name="book" aria-hidden="true" className="mr-1 text-ink-muted" />
              <Link to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</Link>
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
