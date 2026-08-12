import { Link } from "react-router"

import { Clamped } from "~/components/base"
import { CartToggle } from "~/components/cart"
import { FacetPanel } from "~/components/facets"
import { Icon } from "~/components/icons"
import { Table, Td, Value } from "~/components/page"
import { ListingScreen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { canonicalRedirect, researchListPage } from "~/public/lists.server"
import { datasetPath, href, listPath, readLocale, researchPath, searchQuery } from "~/public/urls"

import type { Route } from "./+types/research-list"

const SHOWN_DATASETS = 3

/**
 * The research listing: the public search over the research rows.
 *
 * A row matches on its own text and on the text of every dataset below it, so
 * a term written into an analysis method finds the study it belongs to. What
 * the row shows is the latest published version, which is also what the row's
 * text was derived from.
 *
 * **The columns are the ones v1 shows**, which is as many as a table beside a
 * refinement panel can hold: what the study is called, what is under it, and
 * the two values a reader scans for. Everything else about a research is on its
 * own page, one click away.
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
  return [{ title: `${messages.search.researchList} - ${messages.siteName}` }]
}

export default function ResearchList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.research
  const onThisPage = view.rows.flatMap((row) => row.datasetLabels)
  const headers = [
    <CartToggle key="cart" ids={onThisPage} locale={locale} whole />,
    t.researchId,
    t.datasets,
    t.title,
    messages.dataset.typeOfData,
    t.methods,
  ]
  const otherLink = view.otherCount === null
    ? undefined
    : (
        <Link to={href(locale, listPath("dataset") + searchQuery({ q: view.query, sort: null, page: 1 }))}>
          {messages.search.alsoInDataset(view.otherCount)}
        </Link>
      )

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
          sort={view.requestedSort}
          panel={view.facets}
        />
      )}
      other={otherLink}
      empty={view.rows.length === 0}
    >
      <Table headers={headers}>
        {view.rows.map((row) => (
          <tr key={row.humLabel}>
            <Td narrow><CartToggle ids={row.datasetLabels} locale={locale} /></Td>
            <Td nowrap>
              <Icon name="book" aria-hidden="true" className="mr-1 text-ink-muted" />
              <Link to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</Link>
            </Td>
            <Td className="min-w-40">
              <Datasets labels={row.datasetLabels} humLabel={row.humLabel} locale={locale} />
            </Td>
            <Td className="min-w-56">
              <ScrollCell><Value field={row.title} locale={locale} /></ScrollCell>
            </Td>
            <Td className="min-w-40">
              <ScrollCell><Value field={row.typeOfData} locale={locale} /></ScrollCell>
            </Td>
            <Td className="min-w-40">
              <ScrollCell><Value field={row.methods} locale={locale} /></ScrollCell>
            </Td>
          </tr>
        ))}
      </Table>
    </ListingScreen>
  )
}

/**
 * A long cell scrolls inside itself rather than making the row tall. Not
 * `Clamped` from `~/components/base`, which cuts a list of items short.
 */
function ScrollCell({ children }: { children: React.ReactNode }) {
  return <div className="max-h-24 overflow-y-auto">{children}</div>
}

function Datasets({ labels, humLabel, locale }: {
  labels: string[]
  humLabel: string
  locale: Locale
}) {
  return (
    <Clamped
      shown={SHOWN_DATASETS}
      more={(rest) => messagesFor(locale).search.andMore(rest)}
      items={labels.map((label) => (
        <span key={label} className="whitespace-nowrap">
          <Icon name="database" aria-hidden="true" className="mr-1 text-ink-muted" />
          <Link to={href(locale, datasetPath(label))}>{label}</Link>
        </span>
      ))}
    >
      <Link to={href(locale, researchPath(humLabel))} className="whitespace-nowrap text-brand">
        {messagesFor(locale).search.andMore(labels.length - SHOWN_DATASETS)}
        <Icon name="chevron-right" aria-hidden="true" />
      </Link>
    </Clamped>
  )
}
