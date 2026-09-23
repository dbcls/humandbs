/**
 * The management side of a review.
 *
 * One screen per draft: the link that was handed out, what came back, and what
 * is still waiting for an answer. Comments are also read and answered beside
 * the fields they are about in the editing screens — this is the place that
 * shows all of them at once, and the place the link itself is managed. The
 * memo is not among them: it is the editing screen's own note, not a question.
 */

import { Form, Link } from "react-router"

import {
  adminDraftReviewPath,
  adminResearchPath,
} from "~/admin/urls"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"
import type { ReviewPageView } from "~/review/review.server"

import { AdminBack } from "./admin"
import { Badge, Confirm, Heading, Stack } from "./base"
import { authorLabel, CommentRow, type CommentContext } from "./comments"
import { Checkbox, Editing, Field, Submit, Unsaved } from "./form"
import { Icon } from "./icons"
import { Card, Empty, ExternalLink, Page, Section } from "./page"

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
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={messages.admin.editor.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          <Share view={view} />

          <Section
            title={`${messages.comment.heading} — ${messages.admin.detail.openComments(view.unresolved)}`}
          >
            <Stack gap="normal">
              {/* Answered ones are still listed; the count says how much of the
                  list is already dealt with. */}
              {view.comments.length > view.unresolved && (
                <p className="text-ink-muted text-xs">
                  {`${t.resolvedComments} ${String(view.comments.length - view.unresolved)}`}
                </p>
              )}
              {view.comments.length === 0
                ? <Empty>{t.noComments}</Empty>
                : (
                    <Stack as="ul" gap="normal">
                      {view.comments.map((row) => (
                        <li key={row.comment.id} className="rounded border border-line px-4 py-3">
                          <Stack gap="tight">
                            <p className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold">{row.subject}</span>
                              {/* The draft as a whole names no place, so it has
                                  nothing to print here. */}
                              {row.path !== null
                                && <code className="text-ink-muted">{row.path}</code>}
                              <Link to={row.href}>{t.openEditor}</Link>
                            </p>
                            <CommentRow context={context} comment={row.comment} />
                          </Stack>
                        </li>
                      ))}
                    </Stack>
                  )}
            </Stack>
          </Section>

          {/* **The two marks a reader can leave are two lists**, since they answer
              two different questions — whose turn it is, and whether anything is
              left to fix — and one list would make the reader sort them apart. */}
          {(["commented", "approved"] as const).map((kind) => {
            const rows = view.acknowledgements.filter((row) => row.kind === kind)
            return (
              <Section key={kind} title={kind === "commented" ? messages.preview.commentedBy : messages.preview.approvedBy}>
                {rows.length === 0
                  ? <Empty>{t.nobodyYet}</Empty>
                  : (
                      <ul className="flex flex-wrap gap-2 text-sm">
                        {rows.map((row) => (
                          <li key={`${row.name}-${row.createdAt}`}>
                            <Badge icon={<Icon name="user" aria-hidden="true" />}>
                              {`${authorLabel(locale, row.name, row.bySignedIn)} — ${row.createdAt.slice(0, 10)}`}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
              </Section>
            )
          })}
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
              <ExternalLink to={share.url} locale={locale}>{t.openPreview}</ExternalLink>
            </p>
          )}
        </Stack>

        <Editing method="post" className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="intent" value="share" />
          <Checkbox label={t.enable} name="enabled" checked={share.enabled} />
          <Field label={t.expiryDate} name="expiresOn" type="date" value={share.expiresOn ?? ""} />
          <span className="text-ink-muted text-xs">
            {share.expiresOn === null ? t.expiryNone : ""}
          </span>
          <Submit icon={<Icon name="save" />} saves>{t.save}</Submit>
          <Unsaved locale={locale} />
        </Editing>

        <Form method="post">
          <Confirm
            label={t.reissue}
            title={t.reissueTitle}
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
