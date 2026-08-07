import { useState } from "react"
import { data, Form, Link } from "react-router"

import { researchDetailAction, researchDetailPage } from "~/admin/pages.server"
import type { AdminDraftRow } from "~/admin/queries.server"
import { adminDraftPath, adminResearchListPath } from "~/admin/urls"
import { Card, Empty, Page, PageHead, Section, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/admin-research"

/**
 * One research: which labels are pinned to it, what has been published, and
 * what is being worked on.
 *
 * A research is addressed by its identity here rather than by its hum label,
 * because a research exists before a number has been issued for it — and
 * because a label can be corrected without the page moving.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return researchDetailPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await researchDetailAction(request, locale, params.researchId)
  // A discard refused because somebody edited the draft is the same answer a
  // refused save gives, and it deserves the same status.
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.humLabel ?? messages.admin.detail.heading
  return [
    { title: `${label} - ${messages.admin.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearch({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.detail

  return (
    <Page>
      <PageHead label={view.humLabel ?? t.heading}>
        <Link to={href(locale, adminResearchListPath())} className="text-white">
          {messages.admin.research.heading}
        </Link>
      </PageHead>
      <Card>
        {actionData?.status === "conflict" && (
          <p className="mb-4 rounded-sm border border-accent bg-surface px-4 py-2 text-sm">
            {t.discardConflict}
          </p>
        )}

        <Section title={t.labels}>
          {view.labels.length === 0
            ? <Empty>{t.unpinned}</Empty>
            : (
                <ul className="flex flex-wrap gap-3 text-sm">
                  {view.labels.map((label) => (
                    <li key={label.label} className="flex items-center gap-2">
                      <span>{label.label}</span>
                      <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
                        {label.isPrimary ? t.primary : t.secondary}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
        </Section>

        <Section title={t.versions}>
          {view.versions.length === 0
            ? <Empty>{t.noVersions}</Empty>
            : (
                <Table headers={[t.version, t.releaseDate, t.visibility]}>
                  {view.versions.map((version) => (
                    <tr key={version.id}>
                      <Td className="whitespace-nowrap">
                        {view.humLabel === null || !version.published
                          ? `v${version.number}`
                          : (
                              <Link to={href(locale, `${researchPath(view.humLabel)}/v${version.number}`)}>
                                {`v${version.number}`}
                              </Link>
                            )}
                      </Td>
                      <Td className="whitespace-nowrap">{version.releaseDate}</Td>
                      <Td>{version.published ? t.published : t.withdrawn}</Td>
                    </tr>
                  ))}
                </Table>
              )}
        </Section>

        <Section title={t.drafts}>
          <Form method="post" className="mb-3">
            <input type="hidden" name="intent" value="create-draft" />
            <button
              type="submit"
              className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm"
            >
              {t.createDraft}
            </button>
          </Form>
          {view.drafts.length === 0
            ? <Empty>{t.noDrafts}</Empty>
            : (
                <ul className="flex flex-col gap-3">
                  {view.drafts.map((draft) => (
                    <DraftRow
                      key={draft.id}
                      draft={draft}
                      researchId={view.researchId}
                      locale={locale}
                    />
                  ))}
                </ul>
              )}
        </Section>

        <Section title={t.datasets}>
          {view.datasets.length === 0
            ? <Empty>{t.noDatasets}</Empty>
            : (
                <ul className="flex flex-wrap gap-3 text-sm">
                  {view.datasets.map((row) => (
                    <li key={row.id} className="flex items-center gap-2">
                      <span>{row.label ?? messages.admin.editor.unpinnedDataset}</span>
                      {!row.published && (
                        <span className="text-ink-muted text-xs">{t.unpublishedDataset}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
        </Section>
      </Card>
    </Page>
  )
}

/**
 * Discarding asks twice. It takes the whole draft with it and cannot be undone,
 * and the revision travels with the request so a draft somebody has edited in
 * the meantime is not thrown away on the strength of a stale screen.
 */
function DraftRow({ draft, researchId, locale }: {
  draft: AdminDraftRow
  researchId: string
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail
  const flags = messagesFor(locale).admin.research.flags
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="rounded-sm border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link to={href(locale, adminDraftPath(researchId, draft.id))}>{t.edit}</Link>
          <span className="text-ink-muted text-xs">
            {`${t.updatedAt}: ${draft.updatedAt.slice(0, 10)}`}
          </span>
          <span className="text-ink-muted text-xs">
            {`${t.parent}: ${draft.parentVersionNumber === null ? t.parentNone : `v${draft.parentVersionNumber}`}`}
          </span>
          {draft.flags.unsettled && (
            <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
              {flags.unsettled}
            </span>
          )}
          {draft.flags.untranslated && (
            <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
              {flags.untranslated}
            </span>
          )}
        </div>
        {confirming
          ? (
              <Form method="post" className="flex items-center gap-2">
                <input type="hidden" name="intent" value="discard-draft" />
                <input type="hidden" name="draftId" value={draft.id} />
                <input type="hidden" name="revision" value={draft.revision} />
                <span className="text-danger text-xs">{t.discardWarning}</span>
                <button type="submit" className="cursor-pointer text-danger text-sm underline">
                  {t.discardConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false) }}
                  className="cursor-pointer text-ink-muted text-sm underline"
                >
                  {t.cancel}
                </button>
              </Form>
            )
          : (
              <button
                type="button"
                onClick={() => { setConfirming(true) }}
                className="cursor-pointer text-ink-muted text-sm underline"
              >
                {t.discard}
              </button>
            )}
      </div>
      <p className="mt-2 text-sm">
        {draft.note === "" ? <span className="text-ink-muted">{t.noNote}</span> : draft.note}
      </p>
    </li>
  )
}
