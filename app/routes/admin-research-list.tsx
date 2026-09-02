import { Form, Link } from "react-router"

import { createResearchAction, researchListPage } from "~/admin/pages.server"
import {
  ADMIN_FLAG_KEYS,
  ADMIN_STATUSES,
  type AdminFlagKey,
  type AdminStatus,
} from "~/admin/listing"
import {
  adminResearchListPath,
  adminResearchPath,
  adminUpstreamResearchPath,
  listingQuery,
} from "~/admin/urls"
import { Empty, Page, PageHead, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-research-list"

/**
 * The way into everything a curator works on: every research, published or
 * not, with what it is still missing.
 *
 * The box is a direct lookup rather than the public search — the full-text
 * index only holds what is published, and this listing exists mostly for what
 * is not. The three shortcomings beside it are derived from the content by the
 * same function the rest of the portal uses, so a filter cannot disagree with
 * what the editing screen shows.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return researchListPage(request, locale)
}

export async function action({ request }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return createResearchAction(request, locale)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.research.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchList({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.research

  return (
    <Page>
      <PageHead label={t.heading}>
        <div className="flex items-center gap-4">
          <Form method="post">
            <button type="submit" className="cursor-pointer underline">{t.create}</button>
          </Form>
          <Link to={href(locale, adminUpstreamResearchPath())} className="text-white">
            {messages.admin.templates.open}
          </Link>
        </div>
      </PageHead>
      <div className="rounded-b border border-line border-t-0 px-5 py-5">
        <Filters view={view} locale={locale} />

        <p className="mt-4 text-ink-muted text-sm">{messages.search.results(view.total)}</p>

        {view.rows.length === 0
          ? <Empty>{t.none}</Empty>
          : (
              <div className="mt-3">
                <Table
                  headers={[
                    t.columns.humLabel,
                    t.columns.title,
                    t.columns.status,
                    t.columns.versions,
                    t.columns.drafts,
                    t.columns.datasets,
                    t.columns.incomplete,
                    t.columns.updated,
                  ]}
                >
                  {view.rows.map((row) => (
                    <tr key={row.researchId}>
                      <Td className="whitespace-nowrap">
                        <Link to={href(locale, adminResearchPath(row.researchId))}>
                          {row.humLabel ?? t.unpinned}
                        </Link>
                      </Td>
                      <Td floor="min-w-64">
                        {row.title === ""
                          ? <span className="text-ink-muted">{t.untitled}</span>
                          : row.title}
                      </Td>
                      <Td className="whitespace-nowrap">{t.statuses[row.status]}</Td>
                      <Td>{row.publishedVersions}</Td>
                      <Td>{row.draftCount}</Td>
                      <Td>{row.datasetCount}</Td>
                      <Td>
                        <ul className="flex flex-col gap-1">
                          {ADMIN_FLAG_KEYS.filter((flag) => row.flags[flag]).map((flag) => (
                            <li
                              key={flag}
                              className="whitespace-nowrap rounded border border-accent px-1.5 py-0.5 text-accent text-xs"
                            >
                              {t.flags[flag]}
                            </li>
                          ))}
                        </ul>
                      </Td>
                      <Td className="whitespace-nowrap">{row.updatedOn}</Td>
                    </tr>
                  ))}
                </Table>
                <Pagination view={view} locale={locale} />
              </div>
            )}
      </div>
    </Page>
  )
}

interface ViewProps {
  view: Route.ComponentProps["loaderData"]
  locale: Locale
}

/**
 * A GET form, so a filtered listing has an address that can be kept and shared
 * — the same rule the public listings follow.
 */
function Filters({ view, locale }: ViewProps) {
  const t = messagesFor(locale).admin.research

  return (
    <Form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-xs">{t.keyword}</span>
        <input
          type="search"
          name="q"
          defaultValue={view.keyword}
          className="w-80 rounded border border-line px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-muted text-xs">{t.status}</span>
        <select
          name="status"
          defaultValue={view.status ?? ""}
          className="rounded border border-line px-2 py-1 text-sm"
        >
          <option value="">{t.anyStatus}</option>
          {ADMIN_STATUSES.map((status: AdminStatus) => (
            <option key={status} value={status}>{t.statuses[status]}</option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-ink-muted text-xs">{t.incomplete}</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {ADMIN_FLAG_KEYS.map((flag: AdminFlagKey) => (
            <label key={flag} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="flag"
                value={flag}
                defaultChecked={view.flags.includes(flag)}
              />
              {t.flags[flag]}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        className="cursor-pointer rounded bg-brand px-4 py-1.5 text-sm text-white"
      >
        {t.apply}
      </button>
      <Link to={href(locale, adminResearchListPath())} className="text-sm">{t.reset}</Link>
    </Form>
  )
}

function Pagination({ view, locale }: ViewProps) {
  const messages = messagesFor(locale)
  if (view.pageCount <= 1) return null

  const at = (page: number) => href(locale, adminResearchListPath() + listingQuery({
    keyword: view.keyword,
    status: view.status,
    flags: view.flags,
    page,
  }))

  return (
    <nav aria-label={messages.search.pagination} className="mt-4 flex items-center gap-4 text-sm">
      {view.page > 1 && <Link to={at(view.page - 1)}>{messages.search.previousPage}</Link>}
      <span className="text-ink-muted">{`${view.page} / ${view.pageCount}`}</span>
      {view.page < view.pageCount && <Link to={at(view.page + 1)}>{messages.search.nextPage}</Link>}
    </nav>
  )
}
