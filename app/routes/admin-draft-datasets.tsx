import { useState } from "react"
import { data, Form, Link } from "react-router"

import { draftDatasetListAction, draftDatasetListPage } from "~/admin/pages.server"
import type { DraftDatasetRow } from "~/admin/queries.server"
import {
  adminDraftDatasetPath,
  adminDraftPath,
  adminUpstreamDatasetPath,
  draftPresencePath,
} from "~/admin/urls"
import { PresenceLine } from "~/components/draft-tools"
import { Card, Empty, Page, PageHead } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-datasets"

/**
 * The datasets of a research, as one draft sees them.
 *
 * The marks are separate facts and none of them implies another: a dataset can
 * be published and left off this version, listed and never touched, or
 * introduced here and already written. **A dataset made here is listed
 * straight away** — one created and then left off the list is one nobody would
 * find again — and only one made here and never published can be destroyed.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return draftDatasetListPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await draftDatasetListAction(request, locale, params)
  // Both refusals leave everything as it was, and both deserve to be seen:
  // a stale screen is a conflict, and a dataset that is not this draft's to
  // destroy is a request that should never have been sent.
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.humLabel ?? messages.admin.draft.datasets
  return [
    { title: `${messages.admin.draft.datasets} - ${label} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDatasets({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const t = messagesFor(locale).admin.draft

  return (
    <Page>
      <PageHead label={view.humLabel ?? t.datasets}>
        <Link to={href(locale, adminDraftPath(view.researchId, view.draftId))} className="text-white">
          {t.backToDraft}
        </Link>
      </PageHead>
      <Card>
        <PresenceLine
          locale={locale}
          path={draftPresencePath(view.researchId, view.draftId)}
          initial={view.presence}
        />

        {actionData?.status === "conflict" && (
          <p className="mt-3 rounded-sm border border-accent bg-surface px-4 py-2 text-sm">
            {t.listConflict}
          </p>
        )}
        {actionData?.status === "refused" && (
          <p className="mt-3 rounded-sm border border-danger bg-surface px-4 py-2 text-sm">
            {t.deleteRefused}
          </p>
        )}

        {view.rows.length === 0
          ? <Empty>{t.noDatasets}</Empty>
          : (
              <ul className="mt-4 flex flex-col gap-2">
                {view.rows.map((row) => (
                  <DatasetRow
                    key={row.id}
                    row={row}
                    locale={locale}
                    researchId={view.researchId}
                    draftId={view.draftId}
                    revision={view.revision}
                  />
                ))}
              </ul>
            )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Form method="post">
            <input type="hidden" name="intent" value="create-dataset" />
            <input type="hidden" name="revision" value={view.revision} />
            <button
              type="submit"
              className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm"
            >
              {t.createDataset}
            </button>
          </Form>
          <Link
            to={href(locale, adminUpstreamDatasetPath(view.researchId, view.draftId))}
            className="text-sm"
          >
            {messagesFor(locale).admin.templates.openDataset}
          </Link>
        </div>
      </Card>
    </Page>
  )
}

function DatasetRow({ row, locale, researchId, draftId, revision }: {
  row: DraftDatasetRow
  locale: Locale
  researchId: string
  draftId: string
  revision: number
}) {
  const t = messagesFor(locale).admin.draft
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-sm border border-line px-4 py-2 text-sm">
      <Link
        to={href(locale, adminDraftDatasetPath(researchId, draftId, row.id))}
        className="min-w-48"
      >
        {row.label ?? messagesFor(locale).admin.editor.unpinnedDataset}
      </Link>
      <Mark>{row.listed ? t.listed : t.notListed}</Mark>
      {row.published && <Mark>{t.publishedDataset}</Mark>}
      {row.edited && <Mark>{t.edited}</Mark>}
      {row.isOwn && <Mark>{t.own}</Mark>}
      {row.isOwn && !row.published && (
        confirming
          ? (
              <Form method="post" className="flex items-center gap-2">
                <input type="hidden" name="intent" value="delete-dataset" />
                <input type="hidden" name="datasetId" value={row.id} />
                <input type="hidden" name="revision" value={revision} />
                <span className="text-danger text-xs">{t.deleteWarning}</span>
                <button type="submit" className="cursor-pointer text-danger text-xs underline">
                  {t.deleteConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false) }}
                  className="cursor-pointer text-ink-muted text-xs underline"
                >
                  {messagesFor(locale).admin.detail.cancel}
                </button>
              </Form>
            )
          : (
              <button
                type="button"
                onClick={() => { setConfirming(true) }}
                className="cursor-pointer text-ink-muted text-xs underline"
              >
                {t.deleteDataset}
              </button>
            )
      )}
    </li>
  )
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
      {children}
    </span>
  )
}
