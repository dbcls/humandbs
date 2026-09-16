import { useState } from "react"
import { Form, Link } from "react-router"

import { HUM_LABEL_PATTERN } from "~/admin/labels"
import type { PublishGroupView, PublishPageView, PublishResult } from "~/admin/pages.server"
import { adminDraftPath } from "~/admin/urls"
import { href } from "~/public/urls"

import { AdminBack } from "./admin"
import { Fold, Heading, Stack } from "./base"
import { Answered, Checkbox, CONTROL, Field, RadioGroup, Result, Submit } from "./form"
import { Icon } from "./icons"
import { Card, Empty, Page, Section } from "./page"
import { messagesFor } from "~/i18n/messages"

/**
 * The last screen before a draft becomes a version.
 *
 * It is read rather than written on. What is missing is shown with a way back
 * to the screen that can fix it, and the one thing that can be settled here is
 * a label that is not pinned — because that is what stops the publish, and
 * because pinning one is a single field rather than an edit.
 *
 * That is also why what stops the publish comes first, above the form rather
 * than inside it: pinning is its own operation with its own form, and a form
 * cannot hold another one.
 *
 * The two checks read differently on purpose. What is structural is a wall:
 * there is no confirmation that gets past it. Everything else is a list with a
 * single box under it, and ticking that box is recorded.
 */
export function PublishConfirmation({ view, result }: {
  view: PublishPageView
  result: PublishResult | null
}) {
  const actionData = result
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  // **The number is the whole of the choice.** Taking one a version holds
  // replaces it; taking the next one starts a new version. The draft's origin
  // decides which is offered first and nothing else.
  const [number, setNumber] = useState(view.suggestedNumber ?? view.nextNumber)
  const chosen = view.choices.find((one) => one.number === number)
  const blocked = view.blocks.length > 0

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
        {actionData?.status === "malformed" && (
          <Result ok={false}>{messages.admin.detail.pinMalformed}</Result>
        )}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined} />

          {blocked && <Blocked view={view} />}
          <PrivateFiles view={view} />

          <Form method="post">
            <input type="hidden" name="intent" value="publish" />
            <input type="hidden" name="revision" value={view.revision} />

            <Stack gap="block">
              <Section title={t.what}>
                <Stack gap="normal">
                  {/* `RadioGroup` is uncontrolled, so the choice is read back
                      from the change event that bubbles through this box
                      rather than from a handler passed to the group itself. */}
                  <div
                    onChange={(event) => {
                      const target = event.target as HTMLInputElement
                      if (target.name === "number") setNumber(Number(target.value))
                    }}
                  >
                    <RadioGroup
                      label={t.what}
                      name="number"
                      value={String(number)}
                      options={[
                        {
                          value: String(view.nextNumber),
                          label: `${t.cut} — ${t.cutHint(view.nextNumber)}`,
                        },
                        ...view.choices.map((one) => ({
                          value: String(one.number),
                          label: one.releaseDate === null
                            ? `${t.reissue(one.number)} — ${t.reissueHint}`
                            : `${t.replace(one.number)} — ${t.replaceHint}`,
                        })),
                      ]}
                    />
                  </div>
                  {/* **Remounted when the choice moves**, so the day it offers
                      is the one that belongs to what is now selected: a version
                      being updated keeps its own, and a new one starts today. */}
                  <Field
                    key={number}
                    label={t.releaseDate}
                    name="releaseDate"
                    type="date"
                    value={chosen?.releaseDate ?? view.today}
                  />
                </Stack>
              </Section>

              {view.groups.length > 0 && (
                <Section title={t.findings}>
                  <Stack gap="normal">
                    <Stack as="ul" gap="normal">
                      {view.groups.map((group) => (
                        <FindingGroup key={group.kind} group={group} locale={locale} />
                      ))}
                    </Stack>
                    <Checkbox label={t.acknowledge(view.findingCount)} name="acknowledged" />
                  </Stack>
                </Section>
              )}

              <Changes view={view} />

              <div className="flex items-center gap-4">
                <Submit variant="primary" icon={<Icon name="upload" />} disabled={blocked}>{t.submit}</Submit>
                {/* **The way out of this screen**, which is also what giving
                    up on publishing is: the two are one act, so there is no
                    second link back (`components/admin.tsx` の `AdminBack`). */}
                <AdminBack
                  to={href(locale, adminDraftPath(view.researchId, view.draftId))}
                  label={t.cancel}
                  icon="chevron-left"
                />
              </div>
            </Stack>
          </Form>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * What has to be settled first. A label is pinned from here in its own form —
 * outside the publish form, because it is a different operation and it must not
 * be carried along by the publish button.
 */
function Blocked({ view }: { view: PublishPageView }) {
  const t = messagesFor(view.locale).admin.publish

  return (
    <Section title={t.blocked}>
      <Stack gap="normal">
        <p className="text-ink-muted text-sm">{t.blockedHint}</p>
        <Stack as="ul" gap="normal">
          {view.blocks.map((block) => (
            <li key={`${block.kind}:${block.datasetId ?? ""}`} className="text-sm">
              <Stack gap="tight">
                <p className="text-danger">
                  {block.kind === "hum-label-missing" ? t.humLabelMissing : t.datasetIdMissing}
                </p>
                <PinForm
                  kind={block.kind === "hum-label-missing" ? "hum" : "dataset"}
                  datasetId={block.datasetId}
                  suggestion={block.suggestion}
                  locale={view.locale}
                />
              </Stack>
            </li>
          ))}
        </Stack>
      </Stack>
    </Section>
  )
}

function PinForm({ kind, datasetId, suggestion, locale }: {
  kind: "hum" | "dataset"
  datasetId: string | null
  suggestion: string | null
  locale: PublishPageView["locale"]
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.publish
  const detail = messages.admin.detail

  return (
    <Form method="post" className="flex items-center gap-2">
      <input type="hidden" name="intent" value="pin" />
      <input type="hidden" name="kind" value={kind} />
      {datasetId !== null && <input type="hidden" name="datasetId" value={datasetId} />}
      <input
        type="text"
        name="label"
        required
        aria-label={detail.pinLabel}
        defaultValue={suggestion ?? ""}
        placeholder={kind === "hum" ? detail.pinPlaceholder : detail.pinDatasetPlaceholder}
        pattern={kind === "hum" ? HUM_LABEL_PATTERN : undefined}
        className={`${CONTROL} text-sm`}
      />
      <Submit icon={<Icon name="link" />}>{t.pin}</Submit>
    </Form>
  )
}

/**
 * Making the selected files public, before or after this version goes out.
 *
 * It sits above the publish form rather than inside it, because a form cannot
 * hold another one — the same reason the pin form is up here. **The publish is
 * not made to wait for it**: a switch copies the actual bytes, and where a file
 * sits is a different question from whether this version is out.
 */
function PrivateFiles({ view }: { view: PublishPageView }) {
  const t = messagesFor(view.locale).admin.publish
  const group = view.groups.find((row) => row.kind === "private-file")
  if (group === undefined || group.fileNames.length === 0) return null

  return (
    <Form method="post" className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="intent" value="publish-files" />
      {group.fileNames.map((name) => (
        <input key={name} type="hidden" name="fileName" value={name} />
      ))}
      <span className="text-sm">{t.privateFileNote}</span>
      <Submit icon={<Icon name="upload" />}>{`${t.publishFiles} (${group.fileNames.length})`}</Submit>
    </Form>
  )
}

function FindingGroup({ group, locale }: { group: PublishGroupView, locale: PublishPageView["locale"] }) {
  const t = messagesFor(locale).admin.publish

  return (
    <li>
      <Fold summary={`${t.kinds[group.kind]} ${group.count}`}>
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
      </Fold>
    </li>
  )
}

function Changes({ view }: { view: PublishPageView }) {
  const t = messagesFor(view.locale).admin.publish
  const nothing = view.researchFields === 0
    && view.datasetChanges.length === 0
    && view.listingAdded.length === 0
    && view.listingRemoved.length === 0

  return (
    <Section title={t.changes}>
      {nothing
        ? <Empty>{t.nothingChanges}</Empty>
        : (
            <Stack as="ul" gap="normal">
              {view.researchFields !== null && view.researchFields > 0 && (
                <li className="text-sm">{t.researchChanged(view.researchFields)}</li>
              )}
              {view.datasetChanges.length > 0 && (
                <li className="text-sm">
                  <Stack gap="tight">
                    <p>{t.datasetsChanged}</p>
                    <div className="ml-4">
                      <Stack as="ul" gap="tight">
                        {view.datasetChanges.map((change) => (
                          <li key={change.datasetId} className="flex flex-wrap items-center gap-2">
                            <Link to={change.href}>{change.label ?? change.datasetId}</Link>
                            {change.isNew && (
                              <span className="text-ink-muted text-xs">{t.newDataset}</span>
                            )}
                          </li>
                        ))}
                      </Stack>
                    </div>
                  </Stack>
                </li>
              )}
              {view.listingAdded.length > 0 && (
                <li className="text-sm">{t.listingAdded(view.listingAdded.length)}</li>
              )}
              {view.listingRemoved.length > 0 && (
                <li className="text-sm">{t.listingRemoved(view.listingRemoved.length)}</li>
              )}
            </Stack>
          )}
    </Section>
  )
}
