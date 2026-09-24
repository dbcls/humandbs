import { data, Form } from "react-router"

import { HUM_LABEL_PATTERN } from "~/admin/labels"
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
import { AdminBack, WayTo } from "~/components/admin"
import { ButtonLink, Confirm, Dialog, Heading, Stack } from "~/components/base"
import { Answer, Checkbox, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, ExternalLink, Page, Section, Table, Td } from "~/components/page"
import { minuteInJst } from "~/dates"
import { formatSize } from "~/files/box"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale, researchPath } from "~/public/urls"

import type { Route } from "./+types/admin-research"
import { Flag, Stated } from "~/components/flags"

/**
 * One research: what is out, what is being written, which IDs name it, and
 * the way to its box.
 *
 * A research is addressed by its identity here rather than by its hum label,
 * because a research exists before a number has been issued for it — and
 * because a label can be corrected without the page moving.
 *
 * **Versions and drafts stand in one list.** Publishing turns a draft into a
 * version and withdrawing turns a version back into a draft; a row moves and
 * nothing is added or taken away (docs/publishing.md の「破棄と削除」). Two
 * sections would draw the same row in two places and leave the reader to work
 * out that they are one thing.
 *
 * **The ledger is managed here rather than at publish time.** A label is
 * attached to an identity, not to a version, and correcting one is an everyday
 * operation: the number originates as free text in a system upstream that has
 * typed it wrong before. Taking a version out of sight lives here for the same
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
  // A refusal because somebody edited the draft, and a label that already names
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
              />
            </Form>
          </Heading>

          <Section title={t.rows} note={t.rowsNote}>
            <Stack gap="normal">
              {/* Drafts first, newest writing first; then the versions, newest
                  number first. **The first column says which is which**, and
                  every other column belongs to one kind or the other: a draft
                  has when it was last written and what its review says, a
                  version has a number and a day it went out. **The writing is
                  told to the minute**: drafts carry no name, so two made on
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
              {/* An empty draft: what it comes to hold is taken in or typed
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
                      読めなくなる。**列にするのは印の幅が揃わないため** —
                      「primary」と「secondary」は 11px 違うので、行ごとに流すと
                      ID の頭がその差だけ食い違う。

                      **どちらの ID かは ID の前に立つ。**読むのは ID のほうで、
                      primary か secondary かはその ID をどう読むかを先に言う印
                      なので、後ろに置くと目を戻すことになる。

                      **操作は 1 段離す。**同じ空きで 3 つ並べると、読むもので
                      ある ID が、その両脇を飾る 2 つと同じ重さで立つ。
                    */
                    <ul className="grid grid-cols-[auto_auto_auto] justify-start items-center gap-x-4 gap-y-2 text-sm">
                      {view.labels.map((label) => (
                        <li key={label.id} className="col-span-3 grid grid-cols-subgrid items-center">
                          <Flag kind={label.isPrimary ? "pointed" : "secondary"}>
                            {label.isPrimary ? t.primary : t.secondary}
                          </Flag>
                          <span>{label.label}</span>
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
                            <Unpin pinId={label.id} subject={label.label} locale={locale} />
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
                carry the same one, and that is the ledger's unique constraint
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
                      NHA にもなるが、ここで打つのは hum のほうだけ。 */}
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

          {/* The box is not a draft's and not a version's, so it is reached
              from here and not from either (docs/files.md の「画面」). The name
              does not say what is in it, which is why this one section has a
              line under its name. */}
          <Section title={messages.admin.files.heading} note={t.filesNote}>
            {/* **The way in is a control, and says it goes somewhere.** The one
                thing this section has leads to another screen, so it wears the
                face of the way out (`AdminBack`) with the mark after the word
                (docs/admin-ui.md の「区画の枠」) — a bare link under a name
                reads as a caption, and an outlined button with no mark reads as
                something done here. What the box holds stands beside it. */}
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <WayTo to={href(locale, adminResearchFilesPath(view.researchId))}>
                {t.openFiles}
              </WayTo>
              <span className="text-ink-muted">
                {view.box === null
                  ? messages.admin.files.unavailable
                  : messages.admin.files.summary(view.box.count, formatSize(view.box.bytes))}
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
 * things done to one. **A draft is a draft** — it does not say which version
 * it came from, because it does not know (docs/editing.md の「draft」).
 *
 * **Its dataset count is the way to the dataset listing**; the review and the
 * publish confirmation are offered as things to press (`DraftWays`), since
 * nothing in the row counts what they hold (docs/editing.md の「draft」).
 *
 * Discarding asks twice. It takes the whole draft with it and cannot be undone,
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
          <DraftWays researchId={researchId} draftId={draft.id} locale={locale} />
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
 * **Drawn as a way to another screen, not as a bare count** (`WayTo`): the
 * count is the only way from this table to a draft's datasets, and a number in
 * the link colour among dates and words reads as one more fact of the row.
 */
function Datasets({ count, to, locale }: { count: number, to: string, locale: Locale }) {
  const t = messagesFor(locale).admin.detail
  return <WayTo to={to} icon="database" size="row">{t.datasetCount(count)}</WayTo>
}

/*
  **Whether a draft is shared is a mark and a word**, every draft answers it
  (docs/ui.md の「壊れるもの」). What the review holds is read on the review
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
 * read off a cell**: the review cell says only whether the draft is shared,
 * and a draft nobody has been shown yet still needs a way to be shown.
 */
function DraftWays({ researchId, draftId, locale }: { researchId: string, draftId: string, locale: Locale }) {
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
 * A version: its number, which is the way to the page it is (in a new tab —
 * the reader is here to work, and the page is what they are checking), the
 * day it was published and the day it says it was.
 *
 * **Editing one does not take it out.** It opens the draft the version is
 * updated in — made now if none is open — and the version stays as it is until
 * that draft is published in its place (docs/editing.md の「draft」). **Its
 * dataset count leads to the screen that reads what it lists** — a version is
 * not edited in place, so that screen has nothing to press. **The
 * update is a state of this row, not a row of its own**: while it is on, the
 * row says so, carries the draft's day, dataset count and share in the
 * cells a version leaves empty, offers the draft's review and publishing
 * beside editing it, and offers stopping it;
 * and the version cannot be withdrawn until it is stopped. Making a draft from
 * a version copies it and leaves it out; pressed twice it makes two.
 */
function VersionRow({ version, review, humLabel, researchId, locale }: {
  version: AdminResearchVersionRow
  /** What the review says of the draft it is updated in, while it is. */
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
          {/* The same mark the listing gives a published research. */}
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
          {/* The same order as the name row (docs/admin-ui.md の「画面の名乗り」):
              what leaves nothing behind first, what cannot be undone last.
              Stopping an update throws a draft away, so it stands with
              withdrawing at the end and not beside the way into that draft. */}
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
          {updating !== null && <DraftWays researchId={researchId} draftId={updating.id} locale={locale} />}
          <Form method="post">
            <input type="hidden" name="number" value={version.number} />
            <Submit intent="copy-version" size="row" icon={<Icon name="plus" />}>{t.copyToDraft}</Submit>
          </Form>
          {updating !== null && (
            /* Stopping is discarding the draft; the version is not touched,
               which is what the panel says. */
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
          {/* Taking a version off the page: the mark is the one every way of
              stopping a publication takes, and the state it leaves wears. */}
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

function Unpin({ pinId, subject, locale }: { pinId: string, subject: string, locale: Locale }) {
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
      />
    </Form>
  )
}
