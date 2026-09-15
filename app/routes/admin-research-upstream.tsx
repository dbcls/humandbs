import { Link } from "react-router"

import { upstreamResearchPage } from "~/admin/templates.server"
import { adminResearchPath, adminUpstreamBranchPath, adminUpstreamResearchPath } from "~/admin/urls"
import { Heading, Stack } from "~/components/base"
import { Card, Page, Section, Table, Td } from "~/components/page"
import { UpstreamNotConnected, UpstreamSearch } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-research-upstream"

/**
 * Finding the approved application a draft is to be written from.
 *
 * The application system already holds the study's title, its aims, its methods,
 * the people it is about and the accessions it registered, so a research begins
 * from those rather than from an empty form
 * (docs/editing.md の「下書きを外から作る」).
 *
 * **This screen only finds the branch.** What taking it in would bring, and
 * which draft it goes into, are answered one screen on — that answer depends on
 * what the portal already holds for the hum, and reading it for every row would
 * be reading it for rows nobody opens.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamResearchPage(request, locale)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.templates.heading} - ${messages.admin.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchUpstream({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} />

          {!view.connected
            ? <UpstreamNotConnected locale={locale} dra={false} />
            : (
                <>
                  <UpstreamSearch
                    locale={locale}
                    action={href(locale, adminUpstreamResearchPath())}
                    keyword={view.keyword}
                  />
                  {/*
                    **No count and no page links.** What the box answers with is
                    the applications that matched, cut at a fixed number
                    (`admin/templates.server.ts`) — a total under it would be the
                    size of the cut rather than of what is there, and a reader
                    who cannot see what they came for narrows the words instead
                    of turning a page.
                  */}
                  <Section title={t.applications}>
                    <Table
                      headers={[t.application, t.humLabel, t.approvedOn, t.title, t.pi, t.registered]}
                      whenEmpty={t.none}
                    >
                      {view.rows.map((row) => (
                        <tr key={row.applicationId}>
                          <Td className="whitespace-nowrap">
                            <Link to={href(locale, adminUpstreamBranchPath(row.applicationId))}>
                              {row.applicationId}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap">
                            {row.humLabel === null
                              ? <span className="text-ink-muted">{t.noHumLabel}</span>
                              : row.heldBy === null
                                ? row.humLabel
                                : (
                                    <Link to={href(locale, adminResearchPath(row.heldBy))}>
                                      {row.humLabel}
                                    </Link>
                                  )}
                          </Td>
                          <Td className="whitespace-nowrap">{row.approvedOn ?? ""}</Td>
                          <Td floor="min-w-64">{row.titleJa === "" ? row.titleEn : row.titleJa}</Td>
                          <Td className="whitespace-nowrap">{row.piName}</Td>
                          <Td className="text-xs">{row.accessions.join(", ")}</Td>
                        </tr>
                      ))}
                    </Table>
                  </Section>
                </>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
