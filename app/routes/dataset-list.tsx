import { Fragment, type ReactNode } from "react"
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
import { datasetPath, href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/dataset-list"

const SHOWN_EXPERIMENTS = 3

/**
 * A dataset label, allowed to wrap only where it is already divided.
 *
 * **The column would otherwise be as wide as the longest label in the archive.**
 * Three quarters of them are ten characters (`JGAD001067`), but the portal's own
 * run to twenty-six (`hum0014.v2.jsnp.934ctrl.v1`) — a column held open for the
 * one longest leaves ninety pixels unused on every page that does not hold it,
 * and the column is frozen, so that width is taken from the table on every
 * screen.
 *
 * **A label that wraps anywhere is a label read wrong**, so the breaks are put
 * where the label already has them: after each dot, which is where its parts
 * divide. Nothing else in the cell can break, so a label with no dots keeps the
 * column open by itself — which is what the ten-character ones do.
 */
function wrappable(label: string): ReactNode {
  const parts = label.split(".")
  const last = parts.length - 1
  // The dot stays with the part before it, so a label broken here reads as
  // `hum0014.v2.` and not as a fragment beginning with punctuation.
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index === last ? part : `${part}.`}
      {index !== last && <wbr />}
    </Fragment>
  ))
}

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
      empty={view.rows.length === 0}
    >
      <Table headers={headers} stuck={2}>
        {view.rows.map((row) => (
          <tr key={row.label}>
            <Td stuck={0} narrow><CartToggle ids={[row.label]} locale={locale} /></Td>
            <Td stuck={1} floor="min-w-32">
              <Icon name="database" aria-hidden="true" className="mr-1 text-ink-muted" />
              <Link to={href(locale, datasetPath(row.label))}>{wrappable(row.label)}</Link>
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
