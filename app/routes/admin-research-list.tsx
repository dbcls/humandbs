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
import { Badge, Excerpt, Stack } from "~/components/base"
import { Checkbox, Field, Select, Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, PageLinks, Table, Td } from "~/components/page"
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
        <Form method="post">
          <Submit variant="secondary">{t.create}</Submit>
        </Form>
        <Link to={href(locale, adminUpstreamResearchPath())} className="text-white">
          {messages.admin.templates.open}
        </Link>
      </PageHead>
      <Card>
        <Stack gap="normal">
          <Filters view={view} locale={locale} />

          <p className="text-ink-muted text-sm">{messages.search.results(view.total)}</p>

          {view.rows.length === 0
            ? <Empty>{t.none}</Empty>
            : (
                <Stack gap="normal">
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
                        <Td nowrap>
                          <Link to={href(locale, adminResearchPath(row.researchId))}>
                            {row.humLabel ?? t.unpinned}
                          </Link>
                        </Td>
                        <Td floor="min-w-64">
                          {row.title === ""
                            ? <span className="text-ink-muted">{t.untitled}</span>
                            : (
                                <Excerpt more={messages.search.readMore} less={messages.search.showLess}>
                                  {row.title}
                                </Excerpt>
                              )}
                        </Td>
                        <Td nowrap>{t.statuses[row.status]}</Td>
                        <Td>{row.publishedVersions}</Td>
                        <Td>{row.draftCount}</Td>
                        <Td>{row.datasetCount}</Td>
                        <Td>
                          <ul className="flex flex-col gap-1">
                            {ADMIN_FLAG_KEYS.filter((flag) => row.flags[flag]).map((flag) => (
                              <li key={flag}><Badge tone="accent">{t.flags[flag]}</Badge></li>
                            ))}
                          </ul>
                        </Td>
                        <Td nowrap>{row.updatedOn}</Td>
                      </tr>
                    ))}
                  </Table>
                  <PageLinks
                    label={messages.search.pagination}
                    page={view.page}
                    pageCount={view.pageCount}
                    at={(page) => href(locale, adminResearchListPath() + listingQuery({
                      keyword: view.keyword,
                      status: view.status,
                      flags: view.flags,
                      page,
                    }))}
                    previous={messages.search.previousPage}
                    next={messages.search.nextPage}
                  />
                </Stack>
              )}
        </Stack>
      </Card>
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
      <Field label={t.keyword} name="q" type="search" value={view.keyword} width="w-80" />
      <Select
        label={t.status}
        name="status"
        value={view.status ?? ""}
        options={[
          { value: "", label: t.anyStatus },
          ...ADMIN_STATUSES.map((status: AdminStatus) => ({ value: status, label: t.statuses[status] })),
        ]}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="font-semibold text-ink-muted text-xs">{t.incomplete}</legend>
        <div className="flex flex-wrap gap-3">
          {ADMIN_FLAG_KEYS.map((flag: AdminFlagKey) => (
            <Checkbox
              key={flag}
              label={t.flags[flag]}
              name="flag"
              value={flag}
              checked={view.flags.includes(flag)}
            />
          ))}
        </div>
      </fieldset>
      <Submit variant="primary">{t.apply}</Submit>
      <Link to={href(locale, adminResearchListPath())} className="text-sm">{t.reset}</Link>
    </Form>
  )
}
