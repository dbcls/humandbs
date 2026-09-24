/**
 * The management side of a review.
 *
 * One screen per draft: the link that was handed out, what is still waiting
 * for an answer, and who has pressed which of the two marks. The open comments
 * are the ones the editing screens' panel lists, in the same places and the
 * same rows; what has been resolved is read in the panel of its own place. The
 * memo is not among them: it is the editing screen's own note, not a question.
 */

import { useState } from "react"
import { Form } from "react-router"

import {
  adminDraftReviewPath,
  adminResearchPath,
} from "~/admin/urls"
import { minuteInJst } from "~/dates"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import type { CommentAnchor } from "~/content/types"
import { RESEARCH } from "~/review/anchors"
import type { ReviewPageView } from "~/review/review.server"

import { AdminBack } from "./admin"
import { Button, Confirm, Heading, Stack, TOAST_MS } from "./base"
import { Author, groupedByPlace, PlaceGroup, type CommentContext } from "./comments"
import { SHOWING } from "./contents"
import { Editing, Field, Submit, Unsaved } from "./form"
import { Flag } from "./flags"
import { Icon } from "./icons"
import { Card, Empty, Page, Section, Table, Td } from "./page"
import { researchFieldLabel } from "./research-fields"

/**
 * The first sentence of a mark's words, which is what a heading quotes: the
 * whole of it is a request to the office, and the first sentence is the part
 * that says which mark it is.
 */
export function firstSentence(words: string): string {
  return words.split(/。|\. /)[0] ?? words
}

export function ReviewScreen({ view }: { view: ReviewPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.review
  const editor = messages.admin.editor
  const context: CommentContext = {
    locale,
    action: href(locale, adminDraftReviewPath(view.researchId, view.draftId)),
    subject: RESEARCH,
    canResolve: true,
    signedInName: view.signedInName,
  }

  /**
   * **The places are named as the open-comments panel names them** — a field
   * of the research by its label, a dataset by its id — never by a path.
   */
  const nameOf = (anchor: CommentAnchor): string => {
    switch (anchor.kind) {
      case "research-field":
        return researchFieldLabel(anchor.path, locale) ?? anchor.path
      case "dataset-field":
        return view.datasetLabels[anchor.datasetId] ?? editor.unpinnedDataset
      default:
        return editor.whole
    }
  }
  const groups = groupedByPlace(view.comments, nameOf)

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={editor.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          <Share view={view} />

          {/* **The panel's list, laid out on a screen of its own**: one box per
              place with its name once on top, and the rows the places' own
              panels draw, so resolving here is the same press as there. Nothing
              is written here and no way leads to the place — an answer belongs
              in the panel of the place it answers. */}
          <Section title={editor.openComments}>
            {groups.length === 0
              ? <Empty>{editor.openCommentsEmpty}</Empty>
              : (
                  <Stack as="ul" gap="normal">
                    {groups.map((group) => (
                      <li key={group.key}>
                        <PlaceGroup context={context} group={group} />
                      </li>
                    ))}
                  </Stack>
                )}
          </Section>

          {/* **The two marks are two tables**, since they answer two different
              questions — whose turn it is, and whether anything is left to fix.
              A reader presses again on each round, so a row is a person, with
              when they last pressed and how many times; the same person can
              stand in both. */}
          {(["commented", "approved"] as const).map((kind) => {
            const rows = view.acknowledgements.filter((row) => row.kind === kind)
            const button = firstSentence(kind === "commented" ? messages.preview.commented : messages.preview.approved)
            return (
              <Section key={kind} title={messages.preview.pressedBy(button)}>
                {rows.length === 0
                  ? <Empty>{t.nobodyYet}</Empty>
                  : (
                      <Table headers={[t.who, t.lastPressed, t.times]}>
                        {rows.map((row) => (
                          <tr key={`${row.bySignedIn ? "signed" : "typed"}-${row.name}`}>
                            <Td nowrap><Author locale={locale} name={row.name} bySignedIn={row.bySignedIn} /></Td>
                            <Td nowrap>{minuteInJst(row.createdAt)}</Td>
                            <Td nowrap>{t.timesCount(row.count)}</Td>
                          </tr>
                        ))}
                      </Table>
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
 * The link and how it is shared.
 *
 * **Three lines, one for each thing a curator does here**: whether the link
 * opens, the link itself with what can be done with it, and the settings that
 * decide whether it opens. **The link's row reads in the order of a name row**
 * — the address, copying it, then reissuing it at the far end, the one press
 * that cannot be taken back (`docs/admin-ui.md` の「画面の名乗り」). Private and
 * an expiry can both be undone, so neither of them retires an address that has
 * got out; reissuing does.
 */
function Share({ view }: { view: ReviewPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.review
  const share = view.share

  return (
    <Section title={t.share}>
      <Stack gap="normal">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {share.enabled
            ? <Flag kind="live">{t.shared}</Flag>
            : <Flag kind="off">{t.unshared}</Flag>}
          {share.expired && <Flag kind="short">{t.expired}</Flag>}
          {share.open ? t.shareOn : t.shareOff}
          {/* **What the expiry means is said as what it is now**, beside the
              state, rather than as a rule under the box: an empty box reads
              back here as no expiry. */}
          {share.enabled && !share.expired && (share.expiresOn === null ? t.expiryNone : t.expiryUntil(share.expiresOn))}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* **The whole address, and it opens.** It is what is pasted into a
              mail, so it is written out with the site's origin; and a curator
              checking what a provider will see follows it rather than copying
              it, so it is a link — in a new tab, keeping this screen. A link
              that opens nothing is only its words. The box is a value on
              display, so its edge is the plain `line`. */}
          <p className="min-w-0 flex-1 break-all rounded border border-line bg-surface px-3 py-2 font-mono text-sm">
            {share.open
              ? (
                  <a href={share.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {share.url}
                    <span className="sr-only">{messages.newTab}</span>
                  </a>
                )
              : <span className="text-ink-muted">{share.url}</span>}
          </p>
          <CopyLink url={share.url} words={{ copy: t.copy, copied: t.copied }} />
          <Form method="post" className="ml-auto">
            <Confirm
              label={t.reissue}
              title={t.reissueTitle}
              warning={t.reissueWarning}
              confirm={t.reissueConfirm}
              cancel={messages.admin.detail.cancel}
            >
              <input type="hidden" name="intent" value="reissue" />
            </Confirm>
          </Form>
        </div>

        {/* **Sharing is a switch, the way an alert's showing is**: the button
            says what it would do — the other state — and takes effect as it is
            pressed, saving the expiry typed with it; a tick that waited for
            the save would leave the screen saying one thing while the link does
            another. The save beside it keeps sharing as it stands.

            **One line.** The box's name stands beside it as a word rather than
            as a label over it, and what an empty box means is said by the
            state above — a name above and a rule below made the row three
            lines tall for one date. */}
        <Editing method="post" className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="enabled" value={share.enabled ? "on" : ""} />
          {share.enabled
            ? <Submit intent="share-off" icon={<Icon name="eye-off" />} className={SHOWING}>{t.stopSharing}</Submit>
            : <Submit intent="share-on" icon={<Icon name="eye" />} className={SHOWING}>{t.startSharing}</Submit>}
          <span className="ml-3 flex items-center gap-2">
            <span aria-hidden="true" className="font-semibold text-ink-muted text-xs">{t.expiryDate}</span>
            <Field label={t.expiryDate} name="expiresOn" type="date" value={share.expiresOn ?? ""} hideLabel />
          </span>
          <Submit intent="share" icon={<Icon name="save" />} saves>{t.save}</Submit>
          <Unsaved locale={locale} />
        </Editing>
      </Stack>
    </Section>
  )
}

/**
 * Puts the link on the clipboard, and says so in its own words for as long as
 * an answer stays up. The two words share one cell, so the control keeps the
 * width of the longer whichever it is showing.
 */
function CopyLink({ url, words }: { url: string, words: { copy: string, copied: string } }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      icon={<Icon name={copied ? "check" : "copy"} aria-hidden="true" />}
      onClick={() => {
        void navigator.clipboard.writeText(new URL(url, window.location.href).href).then(() => {
          setCopied(true)
          window.setTimeout(() => {
            setCopied(false)
          }, TOAST_MS)
        })
      }}
    >
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${copied ? "invisible" : ""}`}>{words.copy}</span>
        <span className={`col-start-1 row-start-1 ${copied ? "" : "invisible"}`}>{words.copied}</span>
      </span>
    </Button>
  )
}
