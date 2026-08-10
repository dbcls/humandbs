import { useState, type ReactNode } from "react"
import { data, Form, Link } from "react-router"

import { researchDetailAction, researchDetailPage } from "~/admin/pages.server"
import type { AdminDraftRow } from "~/admin/queries.server"
import {
  adminDraftPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminResearchListPath,
} from "~/admin/urls"
import { Card, Empty, Page, PageHead, Section, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale, researchPath } from "~/public/urls"
import type { DraftReviewSummary } from "~/review/queries.server"

import type { Route } from "./+types/admin-research"

/**
 * One research: which labels are pinned to it, what has been published, and
 * what is being worked on.
 *
 * A research is addressed by its identity here rather than by its hum label,
 * because a research exists before a number has been issued for it — and
 * because a label can be corrected without the page moving.
 *
 * **The ledger is managed here rather than at publish time.** A label is
 * attached to an identity, not to a version, and correcting one is an everyday
 * operation: the number originates as free text in a system upstream that has
 * typed it wrong before. Taking a version out of sight lives here for the same
 * reason — it is an operation on the version, not on anything being written.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return researchDetailPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await researchDetailAction(request, locale, params.researchId)
  // A refusal because somebody edited the draft, and a label that already names
  // something else, are both "the state moved under you".
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
        {actionData?.status === "conflict" && <Notice>{t.discardConflict}</Notice>}
        {actionData?.status === "taken" && <Notice>{t.pinTaken}</Notice>}

        <Section title={t.labels}>
          {view.labels.length === 0
            ? <Empty>{t.unpinned}</Empty>
            : (
                <ul className="mb-3 flex flex-wrap gap-3 text-sm">
                  {view.labels.map((label) => (
                    <li key={label.id} className="flex items-center gap-2">
                      <span>{label.label}</span>
                      <span className="rounded-sm border border-line px-1.5 py-0.5 text-ink-muted text-xs">
                        {label.isPrimary ? t.primary : t.secondary}
                      </span>
                      <Unpin pinId={label.id} locale={locale} />
                    </li>
                  ))}
                </ul>
              )}
          <PinForm
            kind="hum"
            placeholder={t.pinPlaceholder}
            suggestion={null}
            warn={view.everPublished && view.labels.length > 0}
            locale={locale}
          />
        </Section>

        <Section title={t.versions}>
          {view.versions.length === 0
            ? <Empty>{t.noVersions}</Empty>
            : (
                <Table headers={[t.version, t.releaseDate, t.visibility, ""]}>
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
                      <Td>
                        <Visibility
                          versionId={version.id}
                          published={version.published}
                          locale={locale}
                        />
                      </Td>
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
                      review={view.reviews.find((row) => row.draftId === draft.id) ?? null}
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
                <ul className="flex flex-col gap-2 text-sm">
                  {view.datasets.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2">
                      <span>{row.label ?? messages.admin.editor.unpinnedDataset}</span>
                      {!row.published && (
                        <span className="text-ink-muted text-xs">{t.unpublishedDataset}</span>
                      )}
                      {row.pinId === null
                        ? (
                            <PinForm
                              kind="dataset"
                              datasetId={row.id}
                              placeholder={t.pinDatasetPlaceholder}
                              suggestion={view.datasetIdSuggestion}
                              warn={false}
                              locale={locale}
                            />
                          )
                        : <Unpin pinId={row.pinId} locale={locale} />}
                    </li>
                  ))}
                </ul>
              )}
        </Section>
      </Card>
    </Page>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-sm border border-accent bg-surface px-4 py-2 text-sm">{children}</p>
  )
}

/**
 * Something that cannot be taken back asks twice, and says what it does before
 * it is confirmed rather than after.
 */
function Confirm({ label, warning, confirm, locale, children }: {
  label: string
  warning: string
  confirm: string
  locale: Locale
  children: ReactNode
}) {
  const [asking, setAsking] = useState(false)
  const cancel = messagesFor(locale).admin.detail.cancel

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => { setAsking(true) }}
        className="cursor-pointer text-ink-muted text-xs underline"
      >
        {label}
      </button>
    )
  }
  return (
    <Form method="post" className="flex flex-wrap items-center gap-2">
      {children}
      <span className="text-danger text-xs">{warning}</span>
      <button type="submit" className="cursor-pointer text-danger text-xs underline">
        {confirm}
      </button>
      <button
        type="button"
        onClick={() => { setAsking(false) }}
        className="cursor-pointer text-ink-muted text-xs underline"
      >
        {cancel}
      </button>
    </Form>
  )
}

function Visibility({ versionId, published, locale }: {
  versionId: string
  published: boolean
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail

  if (!published) {
    return (
      <Form method="post">
        <input type="hidden" name="intent" value="republish-version" />
        <input type="hidden" name="versionId" value={versionId} />
        <button type="submit" className="cursor-pointer text-brand text-xs underline">
          {t.republish}
        </button>
      </Form>
    )
  }
  return (
    <Confirm
      label={t.withdraw}
      warning={t.withdrawWarning}
      confirm={t.withdrawConfirm}
      locale={locale}
    >
      <input type="hidden" name="intent" value="withdraw-version" />
      <input type="hidden" name="versionId" value={versionId} />
    </Confirm>
  )
}

function Unpin({ pinId, locale }: { pinId: string, locale: Locale }) {
  const t = messagesFor(locale).admin.detail
  return (
    <Confirm label={t.unpin} warning={t.unpinWarning} confirm={t.unpinConfirm} locale={locale}>
      <input type="hidden" name="intent" value="unpin" />
      <input type="hidden" name="pinId" value={pinId} />
    </Confirm>
  )
}

/**
 * Attaching a label. Making it primary demotes the one that was, which keeps
 * the old spelling resolving — that is what the warning is about when something
 * has already been published under it.
 */
function PinForm({ kind, datasetId, placeholder, suggestion, warn, locale }: {
  kind: "hum" | "dataset"
  datasetId?: string
  placeholder: string
  suggestion: string | null
  warn: boolean
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail

  return (
    <Form method="post" className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="intent" value="pin" />
      <input type="hidden" name="kind" value={kind} />
      {datasetId !== undefined && <input type="hidden" name="datasetId" value={datasetId} />}
      <input
        type="text"
        name="label"
        required
        placeholder={placeholder}
        defaultValue={kind === "dataset" ? suggestion ?? "" : ""}
        className="rounded-sm border border-line px-2 py-1"
      />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" name="isPrimary" defaultChecked />
        <span>{t.pinPrimary}</span>
      </label>
      <button
        type="submit"
        className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-xs"
      >
        {t.pinSubmit}
      </button>
      {warn && <span className="text-danger text-xs">{t.pinWarning}</span>}
    </Form>
  )
}

/**
 * Discarding asks twice. It takes the whole draft with it and cannot be undone,
 * and the revision travels with the request so a draft somebody has edited in
 * the meantime is not thrown away on the strength of a stale screen.
 */
function DraftRow({ draft, review, researchId, locale }: {
  draft: AdminDraftRow
  review: DraftReviewSummary | null
  researchId: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.detail
  const flags = messages.admin.research.flags

  return (
    <li className="rounded-sm border border-line px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link to={href(locale, adminDraftPath(researchId, draft.id))}>{t.edit}</Link>
          <Link to={href(locale, adminDraftPublishPath(researchId, draft.id))}>
            {messages.admin.publish.open}
          </Link>
          <Link to={href(locale, adminDraftReviewPath(researchId, draft.id))}>{t.review}</Link>
          {review !== null && (
            <span className="text-ink-muted text-xs">
              {review.shared ? t.shared : review.expired ? t.shareExpired : t.notShared}
            </span>
          )}
          {review !== null && review.unresolved > 0 && (
            <span className="rounded-sm border border-accent px-1.5 py-0.5 text-accent text-xs">
              {t.openComments(review.unresolved)}
            </span>
          )}
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
        <Confirm
          label={t.discard}
          warning={t.discardWarning}
          confirm={t.discardConfirm}
          locale={locale}
        >
          <input type="hidden" name="intent" value="discard-draft" />
          <input type="hidden" name="draftId" value={draft.id} />
          <input type="hidden" name="revision" value={draft.revision} />
        </Confirm>
      </div>
      <p className="mt-2 text-sm">
        {draft.note === "" ? <span className="text-ink-muted">{t.noNote}</span> : draft.note}
      </p>
    </li>
  )
}
