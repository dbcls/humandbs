import { useState } from "react"
import { Form, Link } from "react-router"

import { HUM_LABEL_PATTERN } from "~/admin/labels"
import type { PublishBlockView, PublishGroupView, PublishPageView, PublishResult } from "~/admin/pages.server"
import { adminDraftDatasetPath, adminDraftPath, adminDraftReviewPath, adminResearchPath, draftCommentsPath } from "~/admin/urls"
import type { CommentAnchor } from "~/content/types"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { RESEARCH } from "~/review/anchors"

import { AdminBack, WayTo } from "./admin"
import { Heading, Stack } from "./base"
import { OpenComments, type CommentContext } from "./comments"
import { IdForm, shownNhaId } from "./dataset-id"
import { Flag, Stated } from "./flags"
import { Answer, Checkbox, CONTROL, Field, Submit } from "./form"
import { Icon } from "./icons"
import { Card, Empty, Fact, Facts, Page, Section, Table, Td } from "./page"
import { DatasetCells, datasetColumns } from "./research"
import { researchFieldLabel } from "./research-fields"
import { PressedBy, pressedTitle } from "./review"

/**
 * The last screen before a draft becomes a version.
 *
 * **What is wanted before pressing, in the order it is wanted**: what changes,
 * what stops it, what the review says, what to look at, and last the press
 * with what it does. Every section names
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
      <Answer
        answer={actionData}
        locale={locale}
        ok={(answer) => answer.status === "issued"}
        said={(answer) => {
          switch (answer.status) {
            case "conflict": return messages.admin.conflict
            case "gone": return t.gone
            case "unacknowledged": return t.acknowledgeRequired
            case "taken": return t.pinTaken
            case "issued": return messages.admin.detail.issued(answer.label)
            case "reserved": return messages.admin.detail.pinReserved
            case "number-unavailable": return t.numberUnavailable
            case "malformed": return messages.admin.detail.pinMalformed
            case "unchanged": return view.updating === null ? null : t.unchanged(`v${view.updating.number}`)
            default: return null
          }
        }}
      />
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
          {/* **Both checks stand whatever they find**: a section that is there
              only when something is wrong leaves a clean draft's screen unable
              to say whether it was checked at all. */}
          <Blocked view={view} />
          <Review view={view} />
          <PrivateFilesForm view={view} />

          <Form id={PUBLISH_FORM} method="post">
            <input type="hidden" name="intent" value="publish" />
            <input type="hidden" name="revision" value={view.revision} />
            <Stack gap="block">
              <Findings view={view} />
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
  return view.researchFields === 0 && view.datasetChanges.length === 0 && !view.reordered
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
              {view.reordered && <p className="text-sm">{t.reordered}</p>}
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
  // The rows shown issuing, in the order they were pressed: each shows the
  // number after the one pressed before it, so two rows never show the same.
  const [issuing, setIssuing] = useState<string[]>([])

  if (view.blocks.length === 0) {
    return (
      <Section title={t.blocked}>
        <Empty>{t.noBlocks}</Empty>
      </Section>
    )
  }

  return (
    <Section title={t.blocked} note={t.blockedHint}>
      <Stack gap="normal">
        {/* **Said the way the research's own screen says it**: a missing
            research ID is the same quiet sentence and a box to give one, and
            the datasets without an id are the table alone — the section's
            sentence has said why they are listed, so no line in red stands
            over them. */}
        {hum.map((block) => (
          <Stack key="hum" gap="tight">
            <Empty>{messages.admin.detail.unpinned}</Empty>
            <PinForm block={block} locale={locale} />
          </Stack>
        ))}
        {datasets.length > 0 && (
          <Table align="middle" headers={[...datasetColumns(locale), t.pinColumn]}>
            {datasets.map((block) => (
              <tr key={block.datasetId}>
                <DatasetRowCells view={view} datasetId={block.datasetId ?? ""} label={null} />
                <Td nowrap holds="control">
                  <PinForm
                    block={block}
                    locale={locale}
                    nextNhaId={shownNhaId(view.nextNhaId, issuing, block.datasetId ?? "")}
                    onIssuing={(on) => {
                      const id = block.datasetId ?? ""
                      setIssuing((was) => on ? [...was.filter((one) => one !== id), id] : was.filter((one) => one !== id))
                    }}
                  />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Stack>
    </Section>
  )
}

/**
 * A missing label, given from its row. A research ID is typed; a dataset's id
 * is typed as an archive's accession or issued as the next NHA id, and either
 * is settled by「割り当て」(`IdForm`).
 */
function PinForm({ block, locale, nextNhaId, onIssuing }: {
  block: PublishBlockView
  locale: PublishPageView["locale"]
  /** For a dataset's row: what issuing shows in its box. */
  nextNhaId?: string | null
  onIssuing?: (issuing: boolean) => void
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const detail = messages.admin.detail

  if (block.kind !== "hum-label-missing") {
    return (
      <Form method="post" className="flex items-center gap-2">
        <input type="hidden" name="kind" value="dataset" />
        <input type="hidden" name="datasetId" value={block.datasetId ?? ""} />
        <IdForm nextNhaId={nextNhaId ?? null} locale={locale} onIssuing={onIssuing} size="row" />
      </Form>
    )
  }

  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="pin" />
      <input type="hidden" name="kind" value="hum" />
      <input
        type="text"
        name="label"
        required
        aria-label={detail.pinLabel}
        placeholder={detail.pinPlaceholder}
        pattern={HUM_LABEL_PATTERN}
        className={`${CONTROL} text-sm`}
      />
      <Submit icon={<Icon name="link" />}>{t.pin}</Submit>
    </Form>
  )
}

/**
 * What the review says: whether the link is out, what is still asked, and who
 * has pressed which mark. **Advice only** — publishing is the administrator's
 * call, and this is what it is made on.
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
        <Facts>
          <Fact name={t.share}>
            {review.shared
              ? <Stated kind="shared">{messages.admin.detail.shared}</Stated>
              : review.expired
                ? <Stated kind="short">{messages.admin.detail.shareExpired}</Stated>
                : <Stated kind="hidden">{messages.admin.detail.notShared}</Stated>}
          </Fact>
          <Fact name={t.unresolved}>
            <OpenComments context={context} comments={review.comments} nameOf={nameOf} />
          </Fact>
          {/* **The marks are the review screen's tables**, a row per person with
              when they last pressed and how often (`PressedBy`). */}
          {(["commented", "approved"] as const).map((kind) => (
            <Fact key={kind} name={pressedTitle(kind, locale)}>
              <PressedBy rows={review.acknowledgements.filter((row) => row.kind === kind)} locale={locale} />
            </Fact>
          ))}
        </Facts>
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

/**
 * What the gate lists without stopping, one row to a kind, and the one box that
 * passes it. **A table rather than folds**: the kinds are few and each is short,
 * so what is there is read at a glance instead of opened one fold at a time.
 * Each row names the places it is in — the screen to fix it on, and how many
 * there — and the one kind this screen can act on carries its action.
 */
function Findings({ view }: { view: PublishPageView }) {
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish

  // **The table stands when it is empty**: its columns say what was looked
  // for, and the one row in its place says nothing was found.
  return (
    <Section title={t.findings} note={view.groups.length === 0 ? undefined : t.findingsNote}>
      <Stack gap="normal">
        <Table
          actions
          align="middle"
          headers={[
            t.findingKind,
            t.findingCount,
            t.findingPlaces,
          ]}
          whenEmpty={t.noFindings}
        >
          {view.groups.map((group) => (
            <FindingRow key={group.kind} group={group} locale={locale} />
          ))}
        </Table>
        {view.groups.length > 0 && <Checkbox label={t.acknowledge(view.findingCount)} name="acknowledged" />}
      </Stack>
    </Section>
  )
}

function FindingRow({ group, locale }: { group: PublishGroupView, locale: PublishPageView["locale"] }) {
  const t = messagesFor(locale).admin.publish

  return (
    <tr>
      <Td nowrap>{t.kinds[group.kind]}</Td>
      <Td nowrap>{t.findingTimes(group.count)}</Td>
      <Td>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {group.places.map((place) => (
            <span key={place.label} className="inline-flex items-center gap-1">
              {place.href === null
                ? <span>{place.label}</span>
                : <Link to={place.href}>{place.label}</Link>}
              {group.places.length > 1 && <span className="text-ink-muted text-xs">{`(${place.count})`}</span>}
              {place.note !== null && <span className="text-ink-muted text-xs">{place.note}</span>}
            </span>
          ))}
        </span>
      </Td>
      <Td nowrap holds="control">
        {group.kind === "private-file" && group.fileNames.length > 0 && (
          <Submit form={FILES_FORM} size="row" icon={<Icon name="upload" />}>
            {`${t.publishFiles} (${group.fileNames.length})`}
          </Submit>
        )}
      </Td>
    </tr>
  )
}

/**
 * The number, the day, what pressing does, and the press. **What pressing does
 * is said before it**, since it cannot be taken back as pressed. **The press
 * says why it cannot be pressed** — something stops it, or an update would
 * change nothing (the release date counts as a change, which is why the box is
 * watched).
 *
 * **The two values and the press stand on one line**, with what the values
 * mean under it: two boxes and a button stacked down the section read as
 * three steps, and a hint under each box pushes the button off the boxes'
 * line. **The release date says it is not a schedule** — a day in the future
 * is written onto the version as it is, and the version is out the moment the
 * button is pressed.
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
      <Stack gap="tight">
        {/* The day is watched from the line rather than from its own box, so
            that it can be the same `Field` the number is and the two names
            stand at one height. */}
        <div
          className="flex flex-wrap items-end gap-x-6 gap-y-3"
          onChange={(event) => {
            const box = event.target as HTMLInputElement
            if (box.name === "releaseDate") setReleaseDate(box.value)
          }}
        >
          {updating === null && (
            /* **The number is typed, not chosen from a list.** Any free whole
               number will do — the next one is offered first, and the server
               refuses one a version holds. */
            <Field
              label={t.number}
              name="number"
              type="number"
              value={String(view.nextNumber)}
              width="w-28"
            />
          )}
          <Field label={t.releaseDate} name="releaseDate" type="date" value={view.releaseDate} />
          <Submit variant="primary" icon={<Icon name="upload" />} disabled={refused}>
            {updating === null ? t.submit : t.update(`v${updating.number}`)}
          </Submit>
        </div>
        <div className="text-ink-muted text-xs">
          {updating === null && <p>{t.numberHint}</p>}
          <p>{t.releaseDateHint}</p>
        </div>
      </Stack>
    </Section>
  )
}
