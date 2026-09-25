/**
 * The management side of a review.
 *
 * One screen per draft: the link that was handed out, what is still waiting
 * for an answer, and who has pressed which of the two indicators. The open comments
 * are the ones the editing screens' panel lists, in the same places and the
 * same rows; what has been resolved is read in the panel of its own place. The
 * memo is not among them: it is the editing screen's own note, not a question.
 */

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
import type { AcknowledgementView } from "~/review/comments.server"
import type { ReviewPageView } from "~/review/review.server"
import type { Locale } from "~/i18n/locale"

import { AdminBack } from "./admin"
import { Confirm, CopyButton, Heading, PANE_LABEL, Stack } from "./base"
import { Author, groupedByAnchor, AnchorGroups, type CommentContext } from "./comments"
import { SHOWING } from "./contents"
import { Editing, Field, Submit, Unsaved } from "./form"
import { Flag } from "./flags"
import { Icon } from "./icons"
import { Card, Page, Section, Table, Td } from "./page"
import { researchFieldLabel } from "./research-fields"

/**
 * The first sentence of an indicator's words, which is what a heading quotes: the
 * whole of it is a request to the office, and the first sentence is the part
 * that shows which button it is.
 */
export function firstSentence(words: string): string {
  return words.split(/。|\. /)[0] ?? words
}

/** 「「{マークの 1 文目}」を押した人」 — the name the indicators' tables go by, wherever they stand. */
export function pressedTitle(kind: AcknowledgementView["kind"], locale: Locale): string {
  const messages = messagesFor(locale)
  return messages.preview.pressedBy(firstSentence(kind === "commented" ? messages.preview.commented : messages.preview.approved))
}

/**
 * Who pressed one of the two indicators: a row per person, with when they last
 * pressed and how many times. **A reader presses again on each round**, so a
 * row per press would be the same name over and over; and a name and a time
 * squeezed into one chip leaves nowhere for the count. The review screen and
 * the confirmation before publishing draw the same table.
 */
export function PressedBy({ rows, locale }: { rows: readonly AcknowledgementView[], locale: Locale }) {
  const t = messagesFor(locale).admin.review
  return (
    <Table headers={[t.who, t.lastPressed, t.times]} whenEmpty={t.nobodyYet}>
      {rows.map((row) => (
        <tr key={`${row.bySignedIn ? "signed" : "typed"}-${row.name}`}>
          <Td nowrap><Author locale={locale} name={row.name} bySignedIn={row.bySignedIn} /></Td>
          <Td nowrap>{minuteInJst(row.createdAt)}</Td>
          <Td nowrap>{t.timesCount(row.count)}</Td>
        </tr>
      ))}
    </Table>
  )
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
  const groups = groupedByAnchor(view.comments, nameOf)

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
            <AnchorGroups context={context} groups={groups} />
          </Section>

          {/* **The two indicators are two tables**, since they answer two different
              questions — whose turn it is, and whether anything is left to fix.
              A reader presses again on each round, so a row is a person, with
              when they last pressed and how many times; the same person can
              stand in both. */}
          {(["commented", "approved"] as const).map((kind) => (
            <Section key={kind} title={pressedTitle(kind, locale)}>
              <PressedBy rows={view.acknowledgements.filter((row) => row.kind === kind)} locale={locale} />
            </Section>
          ))}
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
 * that cannot be taken back. Private and
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
            ? <Flag kind="shared">{t.shared}</Flag>
            : <Flag kind="hidden">{t.unshared}</Flag>}
          {share.expired && <Flag kind="short">{t.expired}</Flag>}
          {share.open ? t.shareOn : t.shareOff}
          {/* **What the expiry means is said as what it is now**, beside the
              state, rather than as a rule under the box: an empty field reads
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
          <CopyButton
            text={() => new URL(share.url, window.location.href).href}
            label={t.copy}
            done={messages.copied}
          />
          <Form method="post" className="ml-auto">
            <Confirm
              label={t.reissue}
              title={t.reissueTitle}
              warning={t.reissueWarning}
              confirm={t.reissueConfirm}
              icon="refresh"
              intent="reissue"
            />
          </Form>
        </div>

        {/* **Sharing is a switch, the way an alert's showing is**: the button
            shows what it would do — the other state — and takes effect as it is
            pressed, saving the expiry typed with it; a tick that waited for
            the save would leave the screen indicating one thing while the link does
            another. The save beside it keeps sharing as it remains.

            **One line.** The box's name is shown beside it as a word rather than
            as a label over it, and what an empty field means is said by the
            state above — a name above and a rule below made the row three
            lines tall for one date. */}
        <Editing method="post" className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="enabled" value={share.enabled ? "on" : ""} />
          {share.enabled
            ? <Submit intent="share-off" icon={<Icon name="eye-off" />} className={SHOWING}>{t.stopSharing}</Submit>
            : <Submit intent="share-on" icon={<Icon name="eye" />} className={SHOWING}>{t.startSharing}</Submit>}
          <span className="ml-3 flex items-center gap-2">
            <span aria-hidden="true" className={PANE_LABEL}>{t.expiryDate}</span>
            <Field label={t.expiryDate} name="expiresOn" type="date" value={share.expiresOn ?? ""} hideLabel />
          </span>
          <Submit intent="share" icon={<Icon name="save" />} saves>{t.save}</Submit>
          <Unsaved locale={locale} />
        </Editing>
      </Stack>
    </Section>
  )
}
