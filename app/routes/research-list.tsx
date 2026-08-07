import { Link } from "react-router"

import { AccessTypeBadge, Page, PageHead, Table, Td, Value } from "~/components/page"
import {
  ConditionChips,
  InvalidQuery,
  NoResults,
  Pagination,
  SearchForm,
  SortLinks,
} from "~/components/search"
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
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const locale = readLocale(url.pathname).locale
  const canonical = canonicalRedirect(url, "research", locale)
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
  const headers = [
    t.researchId,
    t.title,
    t.datasets,
    messages.dataset.typeOfData,
    t.methods,
    t.targets,
    messages.dataset.accessType,
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
    <Page>
      <PageHead label={messages.search.researchList} />
      <div className="rounded-b border border-line border-t-0 px-5 py-5">
        <SearchForm locale={locale} target="research" keyword={view.keyword} query={view.query} />
        <ConditionChips conditions={view.conditions} locale={locale} />

        {view.parseError !== null
          ? <InvalidQuery locale={locale} column={view.parseError.column} />
          : (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-ink-muted text-sm">
                    {view.total === 0
                      ? messages.search.results(0)
                      : messages.search.range(view.rangeFrom, view.rangeTo, view.total)}
                  </p>
                  <SortLinks
                    locale={locale}
                    target="research"
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
                            <tr key={row.humLabel}>
                              <Td className="whitespace-nowrap">
                                <Link to={href(locale, researchPath(row.humLabel))}>{row.humLabel}</Link>
                              </Td>
                              <Td className="min-w-64">
                                <Clamped><Value field={row.title} locale={locale} /></Clamped>
                              </Td>
                              <Td className="min-w-40">
                                <Datasets labels={row.datasetLabels} humLabel={row.humLabel} locale={locale} />
                              </Td>
                              <Td className="min-w-48">
                                <Clamped><Value field={row.typeOfData} locale={locale} /></Clamped>
                              </Td>
                              <Td className="min-w-64">
                                <Clamped><Value field={row.methods} locale={locale} /></Clamped>
                              </Td>
                              <Td className="min-w-64">
                                <Clamped><Value field={row.targets} locale={locale} /></Clamped>
                              </Td>
                              <Td>
                                <div className="flex flex-col gap-1">
                                  {row.accessTypes.map((term) => (
                                    <AccessTypeBadge key={term.code} term={term} />
                                  ))}
                                </div>
                              </Td>
                              <Td className="whitespace-nowrap">{row.datePublished ?? "—"}</Td>
                              <Td className="whitespace-nowrap">{row.dateModified ?? "—"}</Td>
                            </tr>
                          ))}
                        </Table>
                        <Pagination
                          locale={locale}
                          target="research"
                          query={view.query}
                          sort={view.sort}
                          page={view.page}
                          pageCount={view.pageCount}
                        />
                      </div>
                    )}
              </>
            )}
      </div>
    </Page>
  )
}

/** A long cell scrolls inside itself rather than making the row tall. */
function Clamped({ children }: { children: React.ReactNode }) {
  return <div className="max-h-24 overflow-y-auto">{children}</div>
}

function Datasets({ labels, humLabel, locale }: {
  labels: string[]
  humLabel: string
  locale: ReturnType<typeof readLocale>["locale"]
}) {
  const shown = labels.slice(0, SHOWN_DATASETS)
  const rest = labels.length - shown.length
  return (
    <ul className="flex flex-col gap-1">
      {shown.map((label) => (
        <li key={label} className="whitespace-nowrap">
          <Link to={href(locale, datasetPath(label))}>{label}</Link>
        </li>
      ))}
      {rest > 0 && (
        <li className="whitespace-nowrap text-sm">
          <Link to={href(locale, researchPath(humLabel))}>
            {messagesFor(locale).search.andMore(rest)}
          </Link>
        </li>
      )}
    </ul>
  )
}
