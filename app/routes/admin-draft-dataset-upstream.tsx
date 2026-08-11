import { data, Form, Link } from "react-router"

import { upstreamDatasetAction, upstreamDatasetPage } from "~/admin/templates.server"
import { adminDraftDatasetsPath, adminUpstreamDatasetPath, upstreamQuery } from "~/admin/urls"
import { Card, Empty, Page, PageHead, Section, Table, Td } from "~/components/page"
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
 * (docs/editing.md の「上流からの下書き」).
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
      <PageHead label={t.headingDataset}>
        <Link
          to={href(locale, adminDraftDatasetsPath(view.researchId, view.draftId))}
          className="text-white"
        >
          {messages.admin.draft.datasets}
        </Link>
      </PageHead>
      <Card>
        {actionData?.status === "taken" && <Notice>{t.takenLabel}</Notice>}
        {actionData?.status === "conflict" && <Notice>{t.conflict}</Notice>}
        {view.unknown !== null && <Notice>{t.unknown(view.unknown)}</Notice>}

        <Section title={t.byAccession}>
          <Form method="get" action={href(locale, here)} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="q" value={view.keyword} />
            <label className="flex flex-col gap-1">
              <span className="text-ink-muted text-xs">{t.accessionHint}</span>
              <input
                type="text"
                name="accession"
                defaultValue={view.accession}
                placeholder="DRA000123"
                className="w-64 rounded-sm border border-line px-2 py-1 font-mono text-sm"
              />
            </label>
            <button
              type="submit"
              className="cursor-pointer rounded-sm bg-brand px-4 py-1.5 text-sm text-white"
            >
              {t.look}
            </button>
          </Form>
        </Section>

        <Section title={t.byApplication}>
          {!view.connected
            ? <Empty>{t.notConnectedDra}</Empty>
            : (
                <>
                  <UpstreamSearch locale={locale} action={href(locale, here)} keyword={view.keyword} />
                  {view.rows.length === 0
                    ? <Empty>{t.none}</Empty>
                    : (
                        <div className="mt-3">
                          <Table
                            headers={[t.application, t.humLabel, t.approvedOn, t.title, t.registered]}
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
                                <Td className="min-w-64">
                                  {row.titleJa === "" ? row.titleEn : row.titleJa}
                                </Td>
                                <Td className="text-xs">{row.accessions.join(", ")}</Td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      )}
                </>
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
      </Card>
    </Page>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-sm border border-accent bg-accent/5 px-3 py-2 text-sm">{children}</p>
  )
}
