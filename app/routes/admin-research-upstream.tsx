import { data, Form, Link } from "react-router"

import { upstreamResearchAction, upstreamResearchPage } from "~/admin/templates.server"
import { adminResearchListPath, adminResearchPath, adminUpstreamResearchPath, upstreamQuery } from "~/admin/urls"
import { AdminCrumbs } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { Card, Page, Section, Table, Td } from "~/components/page"
import { UpstreamChoice, UpstreamNotConnected, UpstreamSearch } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-research-upstream"

/**
 * Starting a research from an approved application.
 *
 * The application system already holds the study's title, its aims, its methods,
 * the people it is about and the accessions it registered, so a research begins
 * from those rather than from an empty form
 * (docs/editing.md の「上流からの下書き」).
 *
 * **A branch whose hum label already names a research offers no button.** The
 * ledger would refuse the pin, and the answer the curator wants is the research
 * that exists, which is what the row links to instead.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamResearchPage(request, locale)
}

export async function action({ request }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamResearchAction(request, locale)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.templates.heading} - ${messages.admin.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchUpstream({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates

  const at = (applicationId: string) =>
    href(locale, adminUpstreamResearchPath() + upstreamQuery({
      keyword: view.keyword,
      applicationId,
    }))

  return (
    <Page>
      <AdminCrumbs
        locale={locale}
        trail={[{
          label: messages.admin.research.heading,
          to: href(locale, adminResearchListPath()),
        }]}
        current={t.heading}
      />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} />
          {actionData?.status === "taken" && <Note kind="danger" live>{t.takenLabel}</Note>}

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
                            <Link to={at(row.applicationId)}>{row.applicationId}</Link>
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

                  {view.branch !== null && view.chosen !== null && (
                    <Section title={view.branch.applicationId}>
                      {view.branch.heldBy === null
                        ? (
                            <Form method="post">
                              <input
                                type="hidden"
                                name="application"
                                value={view.branch.applicationId}
                              />
                              <UpstreamChoice
                                locale={locale}
                                choice={view.chosen}
                                submit={t.create}
                              />
                            </Form>
                          )
                        : (
                            <Note kind="info">
                              {t.heldBy}
                              {" "}
                              <Link to={href(locale, adminResearchPath(view.branch.heldBy))}>
                                {t.openHolder}
                              </Link>
                            </Note>
                          )}
                    </Section>
                  )}
                </>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
