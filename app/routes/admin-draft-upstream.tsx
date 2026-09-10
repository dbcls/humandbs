import { data, Form, Link } from "react-router"

import { upstreamDraftAction, upstreamDraftPage } from "~/admin/templates.server"
import { adminDraftPath, adminDraftUpstreamPath, adminResearchPath, upstreamQuery } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { Card, Page, Section, Table, Td } from "~/components/page"
import { UpstreamMerge } from "~/components/upstream-merge"
import { UpstreamNotConnected, UpstreamSearch } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-upstream"

/**
 * Taking an approved application into a draft that already exists.
 *
 * **A hum gains an approval branch every time its version goes up**, so the
 * second branch and the ones after it have to reach a research that is already
 * there. The screen that creates a research from an application cannot: the
 * ledger refuses a pin that is taken (docs/editing.md の「既存の下書きに
 * 取り込む」).
 *
 * **What arrives is not merged.** The draft and the application stand in two
 * read-only columns and the box under them is what gets written, because the
 * value a curator wants is often neither of the two.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamDraftPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamDraftAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.humLabel ?? messages.admin.editor.heading
  return [
    { title: `${messages.admin.templates.headingDraft} - ${label} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftUpstream({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates

  const at = (applicationId: string) =>
    href(locale, adminDraftUpstreamPath(view.researchId, view.draftId) + upstreamQuery({
      keyword: view.keyword,
      applicationId,
    }))

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.headingDraft}>
            <AdminBack
              to={href(locale, adminDraftPath(view.researchId, view.draftId))}
              label={t.backToDraft}
            />
          </Heading>
          {actionData?.status === "conflict" && <Note kind="warning" live>{t.conflict}</Note>}
          {actionData?.status === "taken" && <Note kind="danger" live>{t.takenLabel}</Note>}

          {!view.connected
            ? <UpstreamNotConnected locale={locale} dra={false} />
            : (
                <>
                  <UpstreamSearch
                    locale={locale}
                    action={href(locale, adminDraftUpstreamPath(view.researchId, view.draftId))}
                    keyword={view.keyword}
                  />
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

                  {view.branch !== null && view.merge !== null && (
                    <Section title={view.branch.applicationId}>
                      <Form method="post">
                        <input type="hidden" name="revision" value={view.revision} />
                        <input type="hidden" name="application" value={view.branch.applicationId} />
                        <UpstreamMerge locale={locale} view={view} />
                      </Form>
                    </Section>
                  )}
                </>
              )}
        </Stack>
      </Card>
    </Page>
  )
}
