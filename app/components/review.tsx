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

import { Badge, Confirm, Stack } from "./base"
import { DdbjMark, Thread, type CommentContext } from "./comments"
import { Checkbox, Field, Submit } from "./form"
import { Card, Empty, Page, PageHead, Section } from "./page"

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
        <Stack gap="block">
          <Share view={view} />

          <Section
            title={`${messages.comment.heading} — ${messages.admin.detail.openComments(view.unresolved)}`}
          >
            <Stack gap="normal">
              {/* Answered ones are still listed; the count says how much of the
                  list is already dealt with. */}
              {view.threads.length > view.unresolved && (
                <p className="text-ink-muted text-xs">
                  {`${t.resolvedThreads} ${String(view.threads.length - view.unresolved)}`}
                </p>
              )}
              {view.threads.length === 0
                ? <Empty>{t.noThreads}</Empty>
                : (
                    <Stack as="ul" gap="normal">
                      {view.threads.map((row) => (
                        <li key={row.thread.id} className="rounded border border-line px-4 py-3">
                          <Stack gap="tight">
                            <p className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold">{row.subject}</span>
                              <code className="text-ink-muted">{row.thread.anchor.path}</code>
                              <Link to={row.href}>{t.openEditor}</Link>
                            </p>
                            <Thread context={context} thread={row.thread} />
                          </Stack>
                        </li>
                      ))}
                    </Stack>
                  )}
            </Stack>
          </Section>

          <Section title={messages.preview.lgtmWho}>
            {view.acknowledgements.length === 0
              ? <Empty>{messages.preview.lgtmHint}</Empty>
              : (
                  <ul className="flex flex-wrap gap-2 text-sm">
                    {view.acknowledgements.map((row) => (
                      <li key={`${row.name}-${row.createdAt}`}>
                        <Badge>
                          {`${row.name} — ${row.createdAt.slice(0, 10)}`}
                          {row.bySignedIn && <DdbjMark locale={locale} />}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
          </Section>
        </Stack>
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
  const detail = messagesFor(locale).admin.detail
  const share = view.share

  return (
    <Section title={t.share}>
      <Stack gap="normal">
        <Stack gap="tight">
          <p className="text-sm">{share.open ? t.shareOn : t.shareOff}</p>
          {share.expired && <p className="text-accent text-sm">{t.expired}</p>}

          {/* A value on display rather than something to type into, so the edge
              stays the plain `line` rather than the input-strength `line-strong`. */}
          <p className="break-all rounded border border-line bg-surface px-3 py-2 text-sm">
            {share.open
              ? <Link to={share.url}>{share.url}</Link>
              : <span className="text-ink-muted">{share.url}</span>}
          </p>
          {/* The same address, named as what it opens: an administrator checking
              what a provider sees is following it, not copying it. */}
          {share.open && (
            <p className="text-xs">
              <Link to={share.url} target="_blank" rel="noreferrer">{t.openPreview}</Link>
            </p>
          )}
        </Stack>

        <Form method="post" className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="intent" value="share" />
          <Checkbox label={t.enable} name="enabled" checked={share.enabled} />
          <Field label={t.expiryDate} name="expiresOn" type="date" value={share.expiresOn ?? ""} />
          <span className="text-ink-muted text-xs">
            {share.expiresOn === null ? t.expiryNone : ""}
          </span>
          <Submit>{t.setExpiry}</Submit>
        </Form>

        <Form method="post">
          <Confirm
            label={t.reissue}
            warning={t.reissueWarning}
            confirm={t.reissueConfirm}
            cancel={detail.cancel}
          >
            <input type="hidden" name="intent" value="reissue" />
          </Confirm>
        </Form>
      </Stack>
    </Section>
  )
}
