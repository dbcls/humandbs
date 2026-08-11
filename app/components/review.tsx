/**
 * The management side of a review.
 *
 * One screen per draft: the link that was handed out, what came back, and what
 * is still waiting for an answer. Threads are also read and answered beside the
 * fields they are about in the editing screens — this is the place that shows
 * all of them at once, and the place the link itself is managed.
 */

import { Form, Link } from "react-router"

import {
  adminDraftPath,
  adminDraftReviewPath,
} from "~/admin/urls"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import type { ReviewPageView } from "~/review/review.server"

import { Thread, type CommentContext } from "./comments"
import { Card, Page, PageHead } from "./page"

export function ReviewScreen({ view }: { view: ReviewPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.review
  const context: CommentContext = {
    locale,
    action: href(locale, adminDraftReviewPath(view.researchId, view.draftId)),
    subject: RESEARCH,
    canResolve: true,
    signedInName: view.signedInName,
  }

  return (
    <Page>
      <PageHead label={`${view.humLabel ?? messages.admin.research.unpinned} — ${t.heading}`}>
        <Link
          to={href(locale, adminDraftPath(view.researchId, view.draftId))}
          className="text-white visited:text-white"
        >
          {t.backToDraft}
        </Link>
      </PageHead>

      <Card>
        <Share view={view} />

        <section className="mt-8">
          <h2 className="mb-3 flex flex-wrap items-baseline gap-2 border-line border-b pb-1 font-semibold text-brand">
            <span>
              {`${messages.comment.heading} — ${messages.admin.detail.openComments(view.unresolved)}`}
            </span>
            {/* Answered ones are still listed; the count says how much of the
                list is already dealt with. */}
            {view.threads.length > view.unresolved && (
              <span className="font-normal text-ink-muted text-xs">
                {`${t.resolvedThreads} ${String(view.threads.length - view.unresolved)}`}
              </span>
            )}
          </h2>
          {view.threads.length === 0
            ? <p className="text-ink-muted text-sm">{t.noThreads}</p>
            : (
                <ul className="flex flex-col gap-4">
                  {view.threads.map((row) => (
                    <li key={row.thread.id} className="rounded-sm border border-line px-4 py-3">
                      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold">{row.subject}</span>
                        <code className="text-ink-muted">{row.thread.anchor.path}</code>
                        <Link to={row.href}>{t.openEditor}</Link>
                      </p>
                      <Thread context={context} thread={row.thread} />
                    </li>
                  ))}
                </ul>
              )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">
            {messages.preview.lgtmWho}
          </h2>
          {view.acknowledgements.length === 0
            ? <p className="text-ink-muted text-sm">{messages.preview.lgtmHint}</p>
            : (
                <ul className="flex flex-wrap gap-2 text-sm">
                  {view.acknowledgements.map((row) => (
                    <li
                      key={`${row.name}-${row.createdAt}`}
                      className="rounded-sm border border-line px-2 py-0.5"
                    >
                      {`${row.name} — ${row.createdAt.slice(0, 10)}`}
                      {row.bySignedIn && <span aria-hidden="true"> 🅳</span>}
                    </li>
                  ))}
                </ul>
              )}
        </section>
      </Card>
    </Page>
  )
}

/**
 * The link and how it is shared. Private and an expiry can both be undone, so
 * neither of them is a way to retire an address that has got out; reissuing is,
 * and it is kept apart because it cannot be undone.
 */
function Share({ view }: { view: ReviewPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.review
  const share = view.share

  return (
    <section>
      <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{t.share}</h2>

      <p className="text-sm">{share.open ? t.shareOn : t.shareOff}</p>
      {share.expired && <p className="mt-1 text-accent text-sm">{t.expired}</p>}

      <p className="mt-2 break-all rounded-sm border border-line bg-surface px-3 py-2 text-sm">
        {share.open
          ? <Link to={share.url}>{share.url}</Link>
          : <span className="text-ink-muted">{share.url}</span>}
      </p>
      {/* The same address, named as what it opens: an administrator checking
          what a provider sees is following it, not copying it. */}
      {share.open && (
        <p className="mt-1 text-xs">
          <Link to={share.url} target="_blank" rel="noreferrer">{t.openPreview}</Link>
        </p>
      )}

      <Form method="post" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <input type="hidden" name="intent" value="share" />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="enabled" defaultChecked={share.enabled} />
          <span>{t.enable}</span>
        </label>
        <label className="flex items-center gap-1">
          <span className="text-ink-muted text-xs">{t.expiryDate}</span>
          <input
            type="date"
            name="expiresOn"
            defaultValue={share.expiresOn ?? ""}
            className="rounded-sm border border-line px-2 py-1"
          />
        </label>
        <span className="text-ink-muted text-xs">
          {share.expiresOn === null ? t.expiryNone : ""}
        </span>
        <button
          type="submit"
          className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-xs"
        >
          {t.setExpiry}
        </button>
      </Form>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-muted text-xs underline">{t.reissue}</summary>
        <Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="intent" value="reissue" />
          <span className="text-danger text-xs">{t.reissueWarning}</span>
          <button type="submit" className="cursor-pointer text-danger text-xs underline">
            {t.reissueConfirm}
          </button>
        </Form>
      </details>
    </section>
  )
}
