import { data, Form, Link } from "react-router"

import { upstreamResearchAction, upstreamResearchPage } from "~/admin/templates.server"
import { adminResearchListPath, adminResearchPath, adminUpstreamResearchPath, upstreamQuery } from "~/admin/urls"
import { Card, Empty, Page, PageHead, Section, Table, Td } from "~/components/page"
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
      <PageHead label={t.heading}>
        <Link to={href(locale, adminResearchListPath())} className="text-white">
          {messages.admin.research.heading}
        </Link>
      </PageHead>
      <Card>
        {actionData?.status === "taken" && <Notice>{t.takenLabel}</Notice>}

        {!view.connected
          ? <UpstreamNotConnected locale={locale} dra={false} />
          : (
              <>
                <UpstreamSearch
                  locale={locale}
                  action={href(locale, adminUpstreamResearchPath())}
                  keyword={view.keyword}
                />
                <Section title={t.applications}>
                  {view.rows.length === 0
                    ? <Empty>{t.none}</Empty>
                    : (
                        <Table
                          headers={[t.application, t.humLabel, t.approvedOn, t.title, t.pi, t.registered]}
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
                              <Td className="min-w-64">{row.titleJa === "" ? row.titleEn : row.titleJa}</Td>
                              <Td className="whitespace-nowrap">{row.piName}</Td>
                              <Td className="text-xs">{row.accessions.join(", ")}</Td>
                            </tr>
                          ))}
                        </Table>
                      )}
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
                          <Notice>
                            {t.heldBy}
                            {" "}
                            <Link to={href(locale, adminResearchPath(view.branch.heldBy))}>
                              {t.openHolder}
                            </Link>
                          </Notice>
                        )}
                  </Section>
                )}
              </>
            )}
      </Card>
    </Page>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded border border-accent bg-accent/5 px-3 py-2 text-sm">{children}</p>
  )
}
