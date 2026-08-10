import { Link } from "react-router"

import { FacetPanel } from "~/components/facets"
import { AccessTypeBadge, Page, PageHead, Table, Td, Value } from "~/components/page"
import {
  ConditionChips,
  InvalidQuery,
  NoResults,
  Pagination,
  RefinableList,
  SearchForm,
  SortLinks,
} from "~/components/search"
import { messagesFor } from "~/i18n/messages"
import { canonicalRedirect, datasetListPage } from "~/public/lists.server"
import { datasetPath, href, listPath, readLocale, researchPath, searchQuery } from "~/public/urls"

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
  return [{ title: `${messages.search.datasetList} - ${messages.siteName}` }]
}

export default function DatasetList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const d = messages.dataset
  const headers = [
    d.datasetId,
    messages.research.researchId,
    d.typeOfData,
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
    <Page>
      <PageHead label={messages.search.datasetList} />
      <div className="rounded-b border border-line border-t-0 px-5 py-5">
        <SearchForm
          locale={locale}
          target="dataset"
          keyword={view.keyword}
          query={view.query}
          facet={view.facet}
          find={view.find}
        />
        <ConditionChips conditions={view.conditions} locale={locale} />

        {view.parseError !== null
          ? <InvalidQuery locale={locale} column={view.parseError.column} />
          : (
              <RefinableList
                panel={(
                  <FacetPanel
                    locale={locale}
                    target="dataset"
                    query={view.query}
                    sort={view.requestedSort}
                    panel={view.facets}
                  />
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-ink-muted text-sm">
                    {view.total === 0
                      ? messages.search.results(0)
                      : messages.search.range(view.rangeFrom, view.rangeTo, view.total)}
                  </p>
                  <SortLinks
                    locale={locale}
                    target="dataset"
                    query={view.query}
                    sort={view.sort}
                    options={view.sortOptions}
                  />
                </div>
                {otherLink !== undefined && <p className="mt-1 text-sm">{otherLink}</p>}

                {view.rows.length === 0
                  ? <NoResults locale={locale} other={otherLink} />
                  : (
                      <div className="mt-4">
                        <Table headers={headers}>
                          {view.rows.map((row) => (
                            <tr key={row.label}>
                              <Td className="whitespace-nowrap">
                                <Link to={href(locale, datasetPath(row.label))}>{row.label}</Link>
                              </Td>
                              <Td className="whitespace-nowrap">
                                <Link to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</Link>
                              </Td>
                              <Td className="min-w-64">
                                <div className="max-h-24 overflow-y-auto">
                                  {row.typeOfData === null
                                    ? null
                                    : <Value field={row.typeOfData} locale={locale} />}
                                </div>
                              </Td>
                              <Td>
                                {row.accessType === null
                                  ? null
                                  : <AccessTypeBadge term={row.accessType} />}
                              </Td>
                              <Td className="whitespace-nowrap">{row.datePublished ?? "—"}</Td>
                              <Td className="whitespace-nowrap">{row.dateModified ?? "—"}</Td>
                            </tr>
                          ))}
                        </Table>
                        <Pagination
                          locale={locale}
                          target="dataset"
                          query={view.query}
                          sort={view.sort}
                          page={view.page}
                          pageCount={view.pageCount}
                        />
                      </div>
                    )}
              </RefinableList>
            )}
      </div>
    </Page>
  )
}
