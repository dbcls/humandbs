import { data, Form } from "react-router"

import { HUM_LABEL_PATTERN, unpinHold, type UnpinHold } from "~/admin/labels"
import type { AdminDraftReviewRow, AdminResearchVersionRow } from "~/admin/pages.server"
import { researchDetailAction, researchDetailPage } from "~/admin/pages.server"
import type { AdminDraftRow } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminResearchFilesPath,
  adminResearchListPath,
  adminVersionDatasetsPath,
} from "~/admin/urls"
import { AdminBack, ScreenLink } from "~/components/admin"
import { ButtonLink, Confirm, Dialog, Heading, Stack } from "~/components/base"
import { Answer, Checkbox, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, ExternalLink, Page, Section, Table, Td } from "~/components/page"
import { minuteInJst } from "~/dates"
import { formatSize } from "~/files/prefix"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/admin-research"
import { Flag, Stated } from "~/components/flags"

/**
 * One research: what is out, what is being written, which IDs name it, and
 * the way to its prefix.
 *
 * A research is addressed by its identity here rather than by its hum label,
 * because a research exists before a number has been issued for it — and
 * because a label can be corrected without the page moving.
 *
 * **Versions and drafts are shown in one list.** Publishing turns a draft into a
 * version and withdrawing turns a version back into a draft; a row moves and
 * nothing is added or taken away. Two sections would draw the same row in two
 * places and leave the reader to work
 * out that they are one thing.
 *
 * **The `label_pin` table is managed here rather than at publish time.** A label is
 * attached to an identity, not to a version, and correcting one is an everyday
 * operation: the number originates as free text in a system upstream that has
 * typed it wrong before. Taking a version out of sight belongs here for the same
 * reason — it is an operation on the version, not on anything being written.
 * **A dataset's id is not pinned here**: datasets are decided on the draft's
 * own screen, and the id where the dataset is written.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return researchDetailPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await researchDetailAction(request, locale, params.researchId)
  // A refusal because somebody edited the draft, and a label that already identifies
  // something else, are both "the state moved under you".
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.detail.heading, loaderData.humLabel) },
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
      <Answer
        answer={actionData}
        locale={locale}
        said={(answer) => {
          switch (answer.status) {
            case "conflict": return messages.admin.conflict
            case "updating": return t.withdrawUpdating
            case "taken": return t.pinTaken
            case "malformed": return t.pinMalformed
            case "holds-files": return t.unpinHoldsFiles
            case "files-remain": return t.deleteResearchFilesRemain
            default: return null
          }
        }}
      />
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchListPath())}
              label={t.backToList}
              icon="chevron-left"
            />
            {/* Last on the row, because it takes the whole research with it.
                The labels come free again afterwards, and what is left of it
                is the event. */}
            <Form method="post">
              <Confirm
                label={t.deleteResearch}
                title={t.deleteResearchTitle(view.humLabel ?? t.heading)}
                warning={t.deleteResearchWarning}
                confirm={t.deleteResearchConfirm}
                intent="delete-research"
                disabled={view.filesRemain === true ? t.deleteResearchFilesRemain : undefined}
              />
            </Form>
          </Heading>

          <Section title={t.rows} note={t.rowsNote}>
            <Stack gap="normal">
              {/* Drafts first, newest writing first; then the versions, newest
                  number first. **The first column shows which is which**, and
                  every other column belongs to one kind or the other: a draft
                  has when it was last written and what its review shows, a
                  version has a number and a day it went out. **The writing is
                  told to the minute**: drafts have no name, so two made on
                  the same day would otherwise be the same row twice. The
                  table stays when empty: the column names say what would
                  stand here. */}
              <Table
                actions
                align="middle"
                headers={[
                  t.kind,
                  t.version,
                  t.updatedAt,
                  t.releaseDate,
                  t.datasets,
                  t.review,
                ]}
                whenEmpty={t.noRows}
              >
                {[...view.drafts]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((draft) => (
                    <DraftRow
                      key={draft.id}
                      draft={draft}
                      review={view.reviews.find((row) => row.draftId === draft.id) ?? null}
                      researchId={view.researchId}
                      locale={locale}
                    />
                  ))}
                {view.versions.map((version) => (
                  <VersionRow
                    key={version.id}
                    version={version}
                    review={version.updating === null
                      ? null
                      : view.reviews.find((row) => row.draftId === version.updating?.id) ?? null}
                    humLabel={view.humLabel}
                    researchId={view.researchId}
                    locale={locale}
                  />
                ))}
              </Table>
              {/* An empty draft: what it comes to hold is imported or typed
                  afterwards. Under the table at its left edge, where the rows
                  begin and where the other things to press on this screen
                  stand. */}
              <Form method="post" className="flex">
                <Submit intent="create-draft" icon={<Icon name="plus" />}>{t.createEmptyDraft}</Submit>
              </Form>
            </Stack>
          </Section>

          <Section title={t.labels} note={t.labelsNote}>
            <Stack gap="normal">
              {view.labels.length === 0
                ? <Empty>{t.unpinned}</Empty>
                : (
                    /*
                      **ID は縦に読み、3 つの列で揃える。**1 行に流すと 2 本目の
                      ID が 1 本目の操作の隣に来て、どの操作がどの ID のものか
                      読めなくなる。**列にするのはバッジの幅が揃わないため** —
                      「primary」と「secondary」は 11px 違うので、行ごとに流すと
                      ID の先頭がその差だけ食い違う。

                      **どちらの ID かは ID の前に置く。**読むのは ID のほうで、
                      primary か secondary かはその ID をどう読むかを先に示すバッジ
                      なので、後ろに置くと目を戻すことになる。

                      **操作は間隔を 1 段階広げて離す。**同じ間隔で 3 つ並べると、読むもので
                      ある ID が、その両側にある 2 つと同じ重さで並ぶ。
                    */
                    <ul className="grid grid-cols-[auto_auto_auto] justify-start items-center gap-x-4 gap-y-2 text-sm">
                      {view.labels.map((label) => (
                        <li key={label.id} className="col-span-3 grid grid-cols-subgrid items-center">
                          <Flag kind={label.isPrimary ? "pointed" : "secondary"}>
                            {label.isPrimary ? t.primary : t.secondary}
                          </Flag>
                          <span className="flex items-center gap-2">
                            {label.label}
                            {/* The files leaving a retired label's prefix for the
                                primary's: the job that moves them is queued or
                                running, and the label cannot go until it ends. */}
                            {unpinHold(label, view.switching) === "moving" && (
                              <Flag kind="waiting">{t.movingFiles}</Flag>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            {/* Moving a label is not taking it away: the one
                                that was primary stays, as secondary. */}
                            {!label.isPrimary && (
                              <Form method="post">
                                <input type="hidden" name="pinId" value={label.id} />
                                <Submit intent="make-primary" size="row" icon={<Icon name="link" />}>
                                  {t.makePrimary}
                                </Submit>
                              </Form>
                            )}
                            <Unpin
                              pinId={label.id}
                              subject={label.label}
                              held={unpinHold(label, view.switching)}
                              locale={locale}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
              {/*
                **Attaching an ID is a panel, not a form on the page.** It is
                done once when the number is issued and again only to correct
                it; a box and a checked box standing open under every research
                would be the loudest thing on a screen about something else.
                Making it primary demotes the one that was, which keeps the old
                spelling resolving. What has to hold is that no two identities
                have the same one, and that is the `label_pin` table's unique constraint
                rather than anything this form can check.
              */}
              <Form method="post">
                <Dialog
                  label={t.addLabel}
                  title={t.addLabel}
                  icon={<Icon name="link" />}
                  action={() => (
                    <Submit intent="pin" variant="primary" icon={<Icon name="link" />}>
                      {t.pinSubmit}
                    </Submit>
                  )}
                >
                  {/* **研究 ID の形は 1 つしかない。** dataset の ID は JGAD にも
                      NHA にもなるが、ここで入力するのは hum のほうだけ。 */}
                  <Field
                    label={t.pinLabel}
                    name="label"
                    placeholder={t.pinPlaceholder}
                    pattern={HUM_LABEL_PATTERN}
                    width="w-full"
                  />
                  <Checkbox label={t.pinPrimary} name="isPrimary" checked />
                </Dialog>
              </Form>
            </Stack>
          </Section>

          {/* The prefix is not a draft's and not a version's, so it is reached
              from here and not from either. The name does not show what is in
              it, which is why this one section has a line under its name. */}
          <Section title={messages.admin.files.heading} note={t.filesNote}>
            {/* **The link is a control, and shows that it goes somewhere.** The one
                thing this section has leads to another screen, so it is shown with the
                style of the back link (`AdminBack`) with the indicator after the word —
                a bare link under a name
                reads as a caption, and an outlined button with no indicator reads as
                something done here. What the prefix holds stands beside it. */}
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <ScreenLink to={href(locale, adminResearchFilesPath(view.researchId))}>
                {t.openFiles}
              </ScreenLink>
              <span className="text-ink-muted">
                {view.fileSummary === null
                  ? messages.admin.files.unavailable
                  : messages.admin.files.summary(view.fileSummary.count, formatSize(view.fileSummary.bytes))}
              </span>
            </p>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * A draft: when it was last written to, what its steps say, and the four
 * things done to one. **A draft is a draft** — it does not show which version
 * it came from, because it does not know.
 *
 * **Its dataset count is the link to the dataset listing**; the review and the
 * publish confirmation are offered as things to press (`DraftLinks`), since
 * nothing in the row counts what they hold.
 *
 * Discarding is confirmed twice. It takes the whole draft with it and cannot be undone,
 * and the revision travels with the request so a draft somebody has edited in
 * the meantime is not thrown away on the strength of a stale screen.
 */
function DraftRow({ draft, review, researchId, locale }: {
  draft: AdminDraftRow
  review: AdminDraftReviewRow | null
  researchId: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.detail

  return (
    <tr>
      <Td nowrap>
        <Stated kind="changed">{t.draft}</Stated>
      </Td>
      <Td />
      <Td nowrap>{minuteInJst(draft.updatedAt)}</Td>
      <Td />
      <Td>
        <Datasets
          count={review?.datasets ?? 0}
          to={href(locale, adminDraftDatasetsPath(researchId, draft.id))}
          locale={locale}
        />
      </Td>
      <Td><Review review={review} locale={locale} /></Td>
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          <ButtonLink
            to={href(locale, adminDraftPath(researchId, draft.id))}
            size="row"
            icon={<Icon name="edit" />}
          >
            {t.edit}
          </ButtonLink>
          <DraftLinks researchId={researchId} draftId={draft.id} locale={locale} />
          <Form method="post">
            <input type="hidden" name="draftId" value={draft.id} />
            <input type="hidden" name="revision" value={draft.revision} />
            <Confirm
              label={t.discard}
              title={t.discardTitle}
              warning={t.discardWarning}
              confirm={t.discardConfirm}
              intent="discard-draft"
              size="row"
            />
          </Form>
        </span>
      </Td>
    </tr>
  )
}

/**
 * How many datasets a row lists, which is always somewhere to go: a draft's to
 * the screen they are decided on (even an empty list has a screen to add the
 * first one on), a version's to the screen that reads what it lists.
 *
 * **Drawn as a link to another screen, not as a bare count** (`ScreenLink`): the
 * count is the only way from this table to a draft's datasets, and a number in
 * the link colour among dates and words reads as one more fact of the row.
 */
function Datasets({ count, to, locale }: { count: number, to: string, locale: Locale }) {
  const t = messagesFor(locale).admin.detail
  return <ScreenLink to={to} icon="database" size="row">{t.datasetCount(count)}</ScreenLink>
}

/*
  **Whether a draft is shared is an indicator and a word**, since every draft is either shared or not.
  What the review holds is read on the review
  screen, which the row's own "レビュー" opens. A version being updated shows its
  draft's in the cell a version leaves empty.
*/
function Review({ review, locale }: { review: AdminDraftReviewRow | null, locale: Locale }) {
  const t = messagesFor(locale).admin.detail
  if (review === null) return null
  if (review.shared) return <Stated kind="shared">{t.shared}</Stated>
  if (review.expired) return <Stated kind="short">{t.shareExpired}</Stated>
  return <Stated kind="hidden">{t.notShared}</Stated>
}

/**
 * The two screens of a draft past writing it, offered on every row that has a
 * draft — a draft's own and a version being updated in one. **Offered, not
 * read off a cell**: the review cell shows only whether the draft is shared,
 * and a draft nobody has been shown yet still needs a way to be shown.
 */
function DraftLinks({ researchId, draftId, locale }: { researchId: string, draftId: string, locale: Locale }) {
  const messages = messagesFor(locale)
  return (
    <>
      <ButtonLink to={href(locale, adminDraftReviewPath(researchId, draftId))} size="row" icon={<Icon name="comment" />}>
        {messages.admin.detail.review}
      </ButtonLink>
      <ButtonLink to={href(locale, adminDraftPublishPath(researchId, draftId))} size="row" icon={<Icon name="upload" />}>
        {messages.admin.publish.open}
      </ButtonLink>
    </>
  )
}

/**
 * A version: its number, which is the link to the page it is (in a new tab —
 * the reader is here to work, and the page is what they are checking), the
 * day it was published and the day it shows it was.
 *
 * **Editing one does not take it out.** It opens the draft the version is
 * updated in — made now if none is open — and the version stays as it is until
 * that draft is published in its place. **Its
 * dataset count leads to the screen that reads what it lists** — a version is
 * not edited in place, so that screen has nothing to press. **The
 * update is a state of this row, not a row of its own**: while it is on, the
 * row shows it, fills in the draft's day, dataset count and share in the
 * cells a version leaves empty, offers the draft's review and publishing
 * beside editing it, and offers stopping it;
 * and the version cannot be withdrawn until it is stopped. Making a draft from
 * a version copies it and leaves it out; pressed twice it makes two.
 */
function VersionRow({ version, review, humLabel, researchId, locale }: {
  version: AdminResearchVersionRow
  /** The review state of the draft it is updated in, while it is. */
  review: AdminDraftReviewRow | null
  humLabel: string | null
  researchId: string
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail
  const name = `v${version.number}`
  const updating = version.updating
  return (
    <tr>
      <Td nowrap>
        <span className="flex items-center gap-2 text-nowrap">
          {/* The same icon the listing gives a published research. */}
          <Stated kind="live">{t.published}</Stated>
          {updating !== null && (
            <Flag kind="changed">{t.updating}</Flag>
          )}
        </span>
      </Td>
      <Td nowrap>
        {humLabel === null
          ? <span>{name}</span>
          : (
              <ExternalLink to={href(locale, `${researchPath(humLabel)}/${name}`)} locale={locale}>
                {name}
              </ExternalLink>
            )}
      </Td>
      <Td nowrap>{minuteInJst(updating === null ? version.updatedAt : updating.updatedAt)}</Td>
      <Td nowrap>{version.releaseDate}</Td>
      <Td>
        {updating === null
          ? (
              <Datasets
                count={version.datasets}
                to={href(locale, adminVersionDatasetsPath(researchId, version.number))}
                locale={locale}
              />
            )
          : (
              <Datasets
                count={review?.datasets ?? 0}
                to={href(locale, adminDraftDatasetsPath(researchId, updating.id))}
                locale={locale}
              />
            )}
      </Td>
      <Td>
        {updating !== null && <Review review={review} locale={locale} />}
      </Td>
      <Td nowrap holds="control">
        <span className="flex items-center gap-1">
          {/* The same order as the name row: what leaves nothing behind first,
              what cannot be undone last.
              Stopping an update throws a draft away, so it is shown with
              withdrawing at the end and not beside the link into that draft. */}
          {updating === null
            ? (
                <Form method="post">
                  <input type="hidden" name="versionId" value={version.id} />
                  <Submit intent="edit-version" size="row" icon={<Icon name="edit" />}>{t.edit}</Submit>
                </Form>
              )
            : (
                <ButtonLink
                  to={href(locale, adminDraftPath(researchId, updating.id))}
                  size="row"
                  icon={<Icon name="edit" />}
                >
                  {t.edit}
                </ButtonLink>
              )}
          {updating !== null && <DraftLinks researchId={researchId} draftId={updating.id} locale={locale} />}
          <Form method="post">
            <input type="hidden" name="number" value={version.number} />
            <Submit intent="copy-version" size="row" icon={<Icon name="plus" />}>{t.copyToDraft}</Submit>
          </Form>
          {updating !== null && (
            /* Stopping is discarding the draft; the version is not touched,
               which is what the panel shows. */
            <Form method="post">
              <input type="hidden" name="draftId" value={updating.id} />
              <input type="hidden" name="revision" value={updating.revision} />
              <Confirm
                label={t.stopUpdating}
                title={t.stopUpdatingTitle(name)}
                warning={t.stopUpdatingWarning}
                confirm={t.stopUpdatingConfirm}
                intent="discard-draft"
                icon="trash"
                size="row"
              />
            </Form>
          )}
          {/* Taking a version off the page: the indicator is the one every way of
              stopping a publication uses, and the state it leaves is shown with. */}
          <Form method="post">
            <input type="hidden" name="versionId" value={version.id} />
            <Confirm
              label={t.withdraw}
              title={t.withdrawTitle(name)}
              warning={t.withdrawWarning}
              confirm={t.withdrawConfirm}
              intent="withdraw-version"
              icon="lock"
              size="row"
              disabled={updating === null ? undefined : t.withdrawUpdating}
            />
          </Form>
        </span>
      </Td>
    </tr>
  )
}

/**
 * Taking a hum label away. **Closed, and indicating why and what to do, while the
 * label's prefix holds files or a switch runs** — the same facts the refusal on
 * pressing reads, which stays for a screen opened before they changed.
 */
function Unpin({ pinId, subject, held, locale }: {
  pinId: string
  subject: string
  held: UnpinHold | null
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail
  return (
    <Form method="post">
      <input type="hidden" name="pinId" value={pinId} />
      <Confirm
        label={t.unpin}
        title={t.unpinTitle(subject)}
        warning={t.unpinWarning}
        confirm={t.unpinConfirm}
        intent="unpin"
        icon="close"
        size="row"
        disabled={held === null ? undefined : t.unpinHeld[held]}
        // The `label_pin` table is shown at the left of the card, with the room to its right.
        reasonAt="left"
      />
    </Form>
  )
}
