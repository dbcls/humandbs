import { Link } from "react-router"

import { Clamped, Excerpt } from "~/components/base"
import { CartToggle } from "~/components/cart"
import { FacetPanel } from "~/components/facets"
import { Icon } from "~/components/icons"
import { AccessTypeBadge, Table, Td, TermLabel, Value } from "~/components/page"
import { ListingScreen } from "~/components/search"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { canonicalRedirect, researchListPage } from "~/public/lists.server"
import { datasetPath, href, listPath, readLocale, researchPath, searchQuery } from "~/public/urls"
import type { TermView } from "~/public/view.server"

import type { Route } from "./+types/research-list"

const SHOWN_DATASETS = 3
const SHOWN_PLATFORMS = 3

/**
 * The research listing: the public search over the research rows.
 *
 * A row matches on its own text and on the text of every dataset below it, so
 * a term written into an analysis method finds the study it belongs to. What
 * the row shows is the latest published version, which is also what the row's
 * text was derived from.
 *
 * **The columns are the ones v1 shows**, which is more than a window holds: the
 * table scrolls sideways and the two that say which row it is stay put
 * (`components/page.tsx`). **Three of them hold what the datasets beneath a
 * study carry** rather than anything the study says of itself — the analysis
 * methods, the platforms and who took part — which is why they are named for
 * the values and not for the sections of the research's own page.
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
  const short = t.listingSummary
  const onThisPage = view.rows.flatMap((row) => row.datasetLabels)
  const headers = [
    <CartToggle key="cart" ids={onThisPage} locale={locale} whole />,
    t.researchId,
    t.datasets,
    t.title,
    short.methods,
    short.typeOfData,
    t.platforms,
    short.targets,
    messages.dataset.accessType,
    t.dataProvider,
    messages.dataset.datePublished,
    messages.dataset.dateModified,
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
      <Table headers={headers} stuck={2}>
        {view.rows.map((row) => (
          <tr key={row.humLabel}>
            <Td stuck={0} narrow><CartToggle ids={row.datasetLabels} locale={locale} /></Td>
            <Td stuck={1} nowrap>
              <Icon name="book" aria-hidden="true" className="mr-1 text-ink-muted" />
              <Link to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</Link>
            </Td>
            <Td floor="min-w-40">
              <Datasets labels={row.datasetLabels} locale={locale} />
            </Td>
            <Td floor="min-w-72">
              <Prose messages={messages}><Value field={row.title} locale={locale} /></Prose>
            </Td>
            <Td floor="min-w-40">
              <Prose messages={messages}><Value field={row.methods} locale={locale} /></Prose>
            </Td>
            <Td floor="min-w-56">
              <Prose messages={messages}><Value field={row.typeOfData} locale={locale} /></Prose>
            </Td>
            <Td floor="min-w-40">
              <Platforms terms={row.platforms} locale={locale} />
            </Td>
            <Td floor="min-w-56">
              <Prose messages={messages}><Value field={row.targets} locale={locale} /></Prose>
            </Td>
            <Td>
              <ul>
                {row.accessTypes.map((term) => (
                  <li key={term.code}><AccessTypeBadge term={term} /></li>
                ))}
              </ul>
            </Td>
            <Td>
              <ul>
                {row.dataProviders.map((provider, at) => (
                  <li key={at}><Value field={provider} locale={locale} /></li>
                ))}
              </ul>
            </Td>
            <Td nowrap floor="min-w-24">{row.datePublished}</Td>
            <Td nowrap floor="min-w-24">{row.dateModified}</Td>
          </tr>
        ))}
      </Table>
    </ListingScreen>
  )
}

/**
 * A cell of prose, cut where the row would otherwise grow. The listing's own
 * name for `Excerpt`, so that the four columns drawn this way name the part
 * once and read the same. Not `Clamped`, which cuts a list of items short.
 */
function Prose({ messages, children }: {
  messages: ReturnType<typeof messagesFor>
  children: React.ReactNode
}) {
  return (
    <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
      {children}
    </Excerpt>
  )
}

function Datasets({ labels, locale }: { labels: string[], locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <Clamped
      shown={SHOWN_DATASETS}
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={labels.map((label) => (
        <span key={label} className="whitespace-nowrap">
          <Icon name="database" aria-hidden="true" className="mr-1 text-ink-muted" />
          <Link to={href(locale, datasetPath(label))}>{label}</Link>
        </span>
      ))}
    />
  )
}

/**
 * What the datasets beneath a study were run on. A study of any size collects
 * these — one of them names twenty-five — so the cell counts the rest instead
 * of opening with them.
 */
function Platforms({ terms, locale }: { terms: TermView[], locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <Clamped
      shown={SHOWN_PLATFORMS}
      more={(rest) => messages.search.andMore(rest)}
      less={messages.search.showLess}
      items={terms.map((term) => <TermLabel key={term.code} term={term} />)}
    />
  )
}
