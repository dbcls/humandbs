import { data, Form, Link } from "react-router"

import { upstreamDatasetAction, upstreamDatasetPage } from "~/admin/templates.server"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  adminResearchListPath,
  adminResearchPath,
  adminUpstreamDatasetPath,
  upstreamQuery,
} from "~/admin/urls"
import { AdminCrumbs } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { Field, Submit } from "~/components/form"
import { Card, Empty, Page, Section, Table, Td } from "~/components/page"
import { UpstreamChoice, UpstreamSearch } from "~/components/upstream"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-dataset-upstream"

/**
 * Adding datasets to a draft from what an archive already holds.
 *
 * Two ways in, because the two archives are reached differently: JGA datasets
 * hang off an approved application and are chosen a branch at a time, while DRA
 * is not in the application system at all and is named by its accession
 * (docs/editing.md の「下書きを外から作る」).
 *
 * **The research's own description is not touched.** Bringing upstream's newer
 * wording into a draft somebody is writing is the three-way take-up, which the
 * editing screen already has; this only adds datasets.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return upstreamDatasetPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await upstreamDatasetAction(request, locale, params)
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.templates.headingDataset} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDatasetUpstream({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.templates
  const here = adminUpstreamDatasetPath(view.researchId, view.draftId)

  const at = (query: { applicationId?: string, accession?: string }) =>
    href(locale, here + upstreamQuery({ keyword: view.keyword, ...query }))

  return (
    <Page>
      <AdminCrumbs
        locale={locale}
        trail={[
          { label: messages.admin.research.heading, to: href(locale, adminResearchListPath()) },
          {
            label: view.humLabel ?? messages.admin.detail.heading,
            to: href(locale, adminResearchPath(view.researchId)),
          },
          {
            label: messages.admin.editor.heading,
            to: href(locale, adminDraftPath(view.researchId, view.draftId)),
          },
          {
            label: messages.admin.draft.datasets,
            to: href(locale, adminDraftDatasetsPath(view.researchId, view.draftId)),
          },
        ]}
        current={t.headingDataset}
      />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.headingDataset} />

          {actionData?.status === "taken" && <Note kind="warning" live>{t.takenLabel}</Note>}
          {actionData?.status === "conflict" && <Note kind="danger" live>{t.conflict}</Note>}
          {view.unknown !== null && <Note kind="warning">{t.unknown(view.unknown)}</Note>}

          <Section title={t.byAccession}>
            <Form method="get" action={href(locale, here)} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="q" value={view.keyword} />
              <Field
                label={t.accessionHint}
                name="accession"
                value={view.accession}
                hint="DRA000123"
                width="w-64"
              />
              <Submit variant="primary">{t.look}</Submit>
            </Form>
          </Section>

          <Section title={t.byApplication}>
            {!view.connected
              ? <Empty>{t.notConnectedDra}</Empty>
              : (
                  <Stack gap="normal">
                    <UpstreamSearch locale={locale} action={href(locale, here)} keyword={view.keyword} />
                    {/* No count and no page links, for the reason the research
                        side gives (`routes/admin-research-upstream.tsx`). */}
                    <Table
                      headers={[t.application, t.humLabel, t.approvedOn, t.title, t.registered]}
                      whenEmpty={t.none}
                    >
                      {view.rows.map((row) => (
                        <tr key={row.applicationId}>
                          <Td className="whitespace-nowrap">
                            <Link to={at({ applicationId: row.applicationId })}>
                              {row.applicationId}
                            </Link>
                          </Td>
                          <Td className="whitespace-nowrap">{row.humLabel ?? ""}</Td>
                          <Td className="whitespace-nowrap">{row.approvedOn ?? ""}</Td>
                          <Td floor="min-w-64">
                            {row.titleJa === "" ? row.titleEn : row.titleJa}
                          </Td>
                          <Td className="text-xs">{row.accessions.join(", ")}</Td>
                        </tr>
                      ))}
                    </Table>
                  </Stack>
                )}
          </Section>

          {view.chosen !== null && (
            <Section title={view.chosen.applicationId ?? view.accession}>
              <Form method="post">
                <input type="hidden" name="revision" value={view.revision} />
                {view.chosen.applicationId !== null && (
                  <input type="hidden" name="application" value={view.chosen.applicationId} />
                )}
                <UpstreamChoice locale={locale} choice={view.chosen} submit={t.add} />
              </Form>
            </Section>
          )}
        </Stack>
      </Card>
    </Page>
  )
}
