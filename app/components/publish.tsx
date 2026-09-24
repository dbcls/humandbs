import { useState } from "react"
import { Form, Link } from "react-router"

import { HUM_LABEL_PATTERN } from "~/admin/labels"
import type { PublishBlockView, PublishGroupView, PublishPageView, PublishResult } from "~/admin/pages.server"
import { adminDraftDatasetPath, adminDraftPath, adminDraftReviewPath, adminResearchPath, draftCommentsPath } from "~/admin/urls"
import type { CommentAnchor } from "~/content/types"
import { minuteInJst } from "~/dates"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"

import { AdminBack, WayTo } from "./admin"
import { Fold, Heading, Stack, Stated } from "./base"
import { Author, OpenComments, type CommentContext } from "./comments"
import { Flag } from "./flags"
import { Answered, Checkbox, CONTROL, Field, Result, Submit } from "./form"
import { Icon } from "./icons"
import { Card, Empty, Page, Section, Table, Td } from "./page"
import { DatasetCells, datasetColumns } from "./research"
import { researchFieldLabel } from "./research-fields"
import { firstSentence } from "./review"

/**
 * The last screen before a draft becomes a version.
 *
 * **What is wanted before pressing, in the order it is wanted** (docs/publishing.md
 * の「公開前の確認の画面」): what changes, what stops it, what the review says,
 * what to look at, and last the press with what it does. Every section names
 * itself with a noun and says in one sentence what it is for; the one thing to
 * press stands at the end, after everything read.
 *
 * It is read rather than written on. What is missing is shown with a way back
 * to the screen that can fix it, and the one thing settled here is a label that
 * is not pinned — because that is what stops the publish, and because pinning
 * one is a single field rather than an edit.
 *
 * **Forms do not nest**, so each thing sent from here is its own form: a pin
 * in its row, the files in a form of their own that their button names, and
 * the publish around the two sections it needs (the acknowledgement and the
 * version).
 */
export function PublishConfirmation({ view, result }: {
  view: PublishPageView
  result: PublishResult | null
}) {
  const actionData = result
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish

  return (
    <Page>
      {/* Only a refusal is answered here: a publish that worked leaves this
          screen for the research it published. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "conflict" && <Result ok={false}>{t.conflict}</Result>}
        {actionData?.status === "gone" && <Result ok={false}>{t.gone}</Result>}
        {actionData?.status === "unacknowledged" && (
          <Result ok={false}>{t.acknowledgeRequired}</Result>
        )}
        {actionData?.status === "taken" && <Result ok={false}>{t.pinTaken}</Result>}
        {actionData?.status === "number-unavailable" && (
          <Result ok={false}>{t.numberUnavailable}</Result>
        )}
        {actionData?.status === "malformed" && (
          <Result ok={false}>{messages.admin.detail.pinMalformed}</Result>
        )}
        {actionData?.status === "unchanged" && view.updating !== null && (
          <Result ok={false}>{t.unchanged(`v${view.updating.number}`)}</Result>
        )}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading
            title={view.updating === null ? t.heading : t.updateHeading}
            aside={view.humLabel ?? undefined}
          >
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={messages.admin.editor.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          <Changes view={view} />
          {view.blocks.length > 0 && <Blocked view={view} />}
          <Review view={view} />
          <PrivateFilesForm view={view} />

          <Form id={PUBLISH_FORM} method="post">
            <input type="hidden" name="intent" value="publish" />
            <input type="hidden" name="revision" value={view.revision} />
            <Stack gap="block">
              {view.groups.length > 0 && <Findings view={view} />}
              <Publish view={view} />
            </Stack>
          </Form>
        </Stack>
      </Card>
    </Page>
  )
}

const PUBLISH_FORM = "publish"
const FILES_FORM = "publish-files"

/** Whether anything this publish writes differs from the version it is measured against. */
function changesNothing(view: PublishPageView): boolean {
  return view.researchFields === 0 && view.datasetChanges.length === 0
}

/**
 * What the version will say that the one it is measured against does not.
 * **The datasets are the rows of the research's own table**, so one with no id
 * yet is told apart by what kind of data it holds rather than by an identity.
 */
function Changes({ view }: { view: PublishPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const note = view.comparedWith === null ? t.changesNoteFirst : t.changesNote(`v${view.comparedWith}`)

  return (
    <Section title={t.changes} note={note}>
      {changesNothing(view)
        ? <Empty>{t.nothingChanges}</Empty>
        : (
            <Stack gap="normal">
              {view.researchFields !== null && view.researchFields > 0 && (
                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <span>{`${t.research}: ${t.researchChanged(view.researchFields)}`}</span>
                  {/* The research's own screen sets the form beside the page it
                      writes, which is where a change is read. */}
                  <WayTo to={href(locale, adminDraftPath(view.researchId, view.draftId))} icon="book">
                    {messages.admin.draft.heading}
                  </WayTo>
                </p>
              )}
              {view.datasetChanges.length > 0 && (
                <Table align="middle" headers={[...datasetColumns(locale), t.changes]}>
                  {view.datasetChanges.map((change) => (
                    <tr key={change.datasetId}>
                      <DatasetRowCells view={view} datasetId={change.datasetId} label={change.label} />
                      <Td nowrap>
                        {change.isNew
                          ? <Flag kind="changed">{t.newDataset}</Flag>
                          : t.datasetFields(change.fields)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Stack>
          )}
    </Section>
  )
}

/** A dataset's cells as the research's table draws them, leading to its editing screen. */
function DatasetRowCells({ view, datasetId, label }: { view: PublishPageView, datasetId: string, label: string | null }) {
  const locale = view.locale
  const name = label ?? messagesFor(locale).admin.editor.unpinnedDataset
  const row = view.datasetRows[datasetId]
    ?? { id: datasetId, label: name, typeOfData: null, accessType: null, datePublished: null }
  return (
    <DatasetCells
      row={row}
      name={name}
      to={href(locale, adminDraftDatasetPath(view.researchId, view.draftId, datasetId))}
      locale={locale}
    />
  )
}

/**
 * What has to be settled first, each row naming what it is about. A label is
 * pinned from its row in a form of its own — a different operation from the
 * publish, which the publish button must not carry along.
 */
function Blocked({ view }: { view: PublishPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const hum = view.blocks.filter((block) => block.kind === "hum-label-missing")
  const datasets = view.blocks.filter((block) => block.kind === "dataset-id-missing")

  return (
    <Section title={t.blocked} note={t.blockedHint}>
      <Stack gap="normal">
        {hum.map((block) => (
          <Stack key="hum" gap="tight">
            <p className="text-danger text-sm">{t.humLabelMissing}</p>
            <PinForm block={block} locale={locale} />
          </Stack>
        ))}
        {datasets.length > 0 && (
          <Stack gap="tight">
            <p className="text-danger text-sm">{t.datasetIdMissing}</p>
            <Table align="middle" headers={[...datasetColumns(locale), t.pinColumn]}>
              {datasets.map((block) => (
                <tr key={block.datasetId}>
                  <DatasetRowCells view={view} datasetId={block.datasetId ?? ""} label={null} />
                  <Td nowrap holds="control"><PinForm block={block} locale={locale} /></Td>
                </tr>
              ))}
            </Table>
          </Stack>
        )}
      </Stack>
    </Section>
  )
}

function PinForm({ block, locale }: { block: PublishBlockView, locale: PublishPageView["locale"] }) {
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const detail = messages.admin.detail
  const kind = block.kind === "hum-label-missing" ? "hum" : "dataset"

  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="pin" />
      <input type="hidden" name="kind" value={kind} />
      {block.datasetId !== null && <input type="hidden" name="datasetId" value={block.datasetId} />}
      <input
        type="text"
        name="label"
        required
        aria-label={detail.pinLabel}
        defaultValue={block.suggestion ?? ""}
        placeholder={kind === "hum" ? detail.pinPlaceholder : detail.pinDatasetPlaceholder}
        pattern={kind === "hum" ? HUM_LABEL_PATTERN : undefined}
        className={`${CONTROL} text-sm`}
      />
      <Submit icon={<Icon name="link" />}>{t.pin}</Submit>
    </Form>
  )
}

/**
 * What the review says: whether the link is out, what is still asked, and who
 * has pressed which mark. **Advice only** — publishing is the administrator's
 * call, and this is what it is made on (docs/editing.md の「レビュー」).
 *
 * **The open questions are the panel the editing screen opens**
 * (`OpenComments`) — read and resolved here without leaving for the review
 * screen, whose way stands under the list for everything else.
 */
function Review({ view }: { view: PublishPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const review = view.review

  const context: CommentContext = {
    locale,
    action: draftCommentsPath(view.researchId, view.draftId),
    subject: RESEARCH,
    canResolve: true,
    signedInName: review.signedInName,
  }
  // The screen's own words for a place, as the editing screen calls it.
  const nameOf = (anchor: CommentAnchor): string => {
    if (anchor.kind === "research-field") return researchFieldLabel(anchor.path, locale) ?? anchor.path
    if (anchor.kind === "dataset-field") return review.datasetLabels[anchor.datasetId] ?? messages.admin.editor.unpinnedDataset
    return messages.admin.editor.whole
  }

  return (
    <Section title={t.review} note={t.reviewNote}>
      <Stack gap="normal">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          <dt className="text-ink-muted">{t.share}</dt>
          <dd>
            {review.shared
              ? <Stated icon="link">{messages.admin.detail.shared}</Stated>
              : <Stated icon="lock">{messages.admin.detail.notShared}</Stated>}
          </dd>
          <dt className="text-ink-muted">{t.unresolved}</dt>
          <dd><OpenComments context={context} comments={review.comments} nameOf={nameOf} /></dd>
          {(["commented", "approved"] as const).map((kind) => {
            const rows = review.acknowledgements.filter((row) => row.kind === kind)
            const button = firstSentence(kind === "commented" ? messages.preview.commented : messages.preview.approved)
            return (
              <div key={kind} className="contents">
                <dt className="text-ink-muted">{messages.preview.pressedBy(button)}</dt>
                <dd>
                  {rows.length === 0
                    ? messages.admin.review.nobodyYet
                    : (
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          {rows.map((row) => (
                            <span key={`${row.bySignedIn ? "signed" : "typed"}-${row.name}`} className="flex items-center gap-2">
                              <Author locale={locale} name={row.name} bySignedIn={row.bySignedIn} />
                              <span className="text-ink-muted">{minuteInJst(row.createdAt)}</span>
                            </span>
                          ))}
                        </span>
                      )}
                </dd>
              </div>
            )
          })}
        </dl>
        <div>
          <WayTo to={href(locale, adminDraftReviewPath(view.researchId, view.draftId))} icon="comment">
            {messages.admin.review.heading}
          </WayTo>
        </div>
      </Stack>
    </Section>
  )
}

/**
 * The form the private files are published by. **It holds no control of its
 * own**: its button stands in the findings, beside the files it is about, and
 * names this form — the findings are inside the publish form, which it cannot
 * be nested in.
 */
function PrivateFilesForm({ view }: { view: PublishPageView }) {
  const group = view.groups.find((row) => row.kind === "private-file")
  if (group === undefined || group.fileNames.length === 0) return null
  return (
    <Form id={FILES_FORM} method="post" className="hidden">
      <input type="hidden" name="intent" value="publish-files" />
      {group.fileNames.map((name) => (
        <input key={name} type="hidden" name="fileName" value={name} />
      ))}
    </Form>
  )
}

/** What the gate lists without stopping, by kind, and the one box that passes it. */
function Findings({ view }: { view: PublishPageView }) {
  const t = messagesFor(view.locale).admin.publish

  return (
    <Section title={t.findings} note={t.findingsNote}>
      <Stack gap="normal">
        <Stack as="ul" gap="normal">
          {view.groups.map((group) => (
            <FindingGroup key={group.kind} group={group} locale={view.locale} />
          ))}
        </Stack>
        <Checkbox label={t.acknowledge(view.findingCount)} name="acknowledged" />
      </Stack>
    </Section>
  )
}

function FindingGroup({ group, locale }: { group: PublishGroupView, locale: PublishPageView["locale"] }) {
  const t = messagesFor(locale).admin.publish

  return (
    <li>
      <Fold summary={`${t.kinds[group.kind]} ${group.count}`}>
        <Stack gap="tight">
          <Stack as="ul" gap="tight">
            {group.places.map((place) => (
              <li key={place.label} className="flex flex-wrap items-center gap-2 text-sm">
                {place.href === null
                  ? <span>{place.label}</span>
                  : <Link to={place.href}>{place.label}</Link>}
                <span className="text-ink-muted text-xs">{place.count}</span>
                {place.note !== null && <span className="text-ink-muted text-xs">{place.note}</span>}
              </li>
            ))}
          </Stack>
          {group.kind === "private-file" && group.fileNames.length > 0 && (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink-muted">{t.privateFileNote}</span>
              <Submit form={FILES_FORM} icon={<Icon name="upload" />}>
                {`${t.publishFiles} (${group.fileNames.length})`}
              </Submit>
            </p>
          )}
        </Stack>
      </Fold>
    </li>
  )
}

/**
 * The number, the day, what pressing does, and the press. **What pressing does
 * is said before it**, since it cannot be taken back as pressed: the draft
 * becomes the version and is gone. **The press says why it cannot be pressed**
 * — something stops it, or an update would change nothing (the release date
 * counts as a change, which is why the box is watched).
 */
function Publish({ view }: { view: PublishPageView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.publish
  const [releaseDate, setReleaseDate] = useState(view.releaseDate)
  const updating = view.updating
  const unchanged = updating !== null && changesNothing(view) && releaseDate === view.updatingReleaseDate
    ? t.unchanged(`v${updating.number}`)
    : undefined
  const refused = view.blocks.length > 0 ? t.blockedReason : unchanged

  return (
    <Section title={t.what} note={updating === null ? t.publishNote : t.updateNote(`v${updating.number}`)}>
      <Stack gap="normal">
        {updating === null && (
          <>
            {/* **The number is typed, not chosen from a list.** Any free whole
                number will do — the next one is offered first, and the ones
                versions hold are said beside the box because they are the ones
                the server refuses (docs/publishing.md の「版番号」). */}
            <Field
              label={t.number}
              name="number"
              type="number"
              value={String(view.nextNumber)}
              width="w-28"
              hint={t.numberHint}
            />
            <p className="text-ink-muted text-xs">
              {view.heldNumbers.length === 0
                ? t.noneHeld
                : t.held(view.heldNumbers.map((number) => `v${number}`).join(", "))}
            </p>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink-muted text-xs">{t.releaseDate}</span>
          <input
            type="date"
            name="releaseDate"
            value={releaseDate}
            onChange={(event) => { setReleaseDate(event.currentTarget.value) }}
            className={`${CONTROL} w-48`}
          />
        </label>
        <div>
          <Submit variant="primary" icon={<Icon name="upload" />} disabled={refused}>
            {updating === null ? t.submit : t.update(`v${updating.number}`)}
          </Submit>
        </div>
      </Stack>
    </Section>
  )
}
