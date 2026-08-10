import { useState, type ReactNode } from "react"
import { Form, Link } from "react-router"

import type { PublishGroupView, PublishPageView, PublishResult } from "~/admin/pages.server"
import { adminDraftPath } from "~/admin/urls"
import { href } from "~/public/urls"

import { Card, Empty, Page, PageHead, Section } from "./page"
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
  const [asFix, setAsFix] = useState(false)
  const blocked = view.blocks.length > 0

  return (
    <Page>
      <PageHead label={view.humLabel ?? messages.admin.detail.heading}>
        <Link
          to={href(locale, adminDraftPath(view.researchId, view.draftId))}
          className="text-white"
        >
          {t.backToDraft}
        </Link>
      </PageHead>
      <Card>
        <h2 className="mb-4 font-bold text-lg">{t.heading}</h2>

        {actionData?.status === "conflict" && <Warning>{t.conflict}</Warning>}
        {actionData?.status === "unacknowledged" && <Warning>{t.acknowledgeRequired}</Warning>}
        {actionData?.status === "taken" && <Warning>{t.pinTaken}</Warning>}
        {view.staleAgainst !== null && <Warning>{t.stale(view.staleAgainst)}</Warning>}

        {blocked && <Blocked view={view} />}

        <Form method="post" className="flex flex-col gap-6">
          <input type="hidden" name="intent" value="publish" />
          <input type="hidden" name="revision" value={view.revision} />

          <Section title={t.what}>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="version"
                  checked={!asFix}
                  onChange={() => { setAsFix(false) }}
                />
                <span>{t.cut}</span>
                <span className="text-ink-muted">{t.cutHint(view.nextNumber)}</span>
              </label>
              {view.fixNumber === null
                ? <p className="text-ink-muted text-xs">{t.fixUnavailable}</p>
                : (
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="mode"
                        value="fix"
                        checked={asFix}
                        onChange={() => { setAsFix(true) }}
                      />
                      <span>{t.fix}</span>
                      <span className="text-ink-muted">{t.fixHint(view.fixNumber)}</span>
                    </label>
                  )}
              {!asFix && (
                <label className="flex items-center gap-2">
                  <span>{t.releaseDate}</span>
                  <input
                    type="date"
                    name="releaseDate"
                    defaultValue={view.today}
                    className="rounded-sm border border-line px-2 py-1"
                  />
                </label>
              )}
            </div>
          </Section>

          {view.groups.length > 0 && (
            <Section title={t.findings}>
              <ul className="flex flex-col gap-3">
                {view.groups.map((group) => (
                  <FindingGroup key={group.kind} group={group} locale={locale} />
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="acknowledged" />
                <span>{t.acknowledge(view.findingCount)}</span>
              </label>
            </Section>
          )}

          <Changes view={view} asFix={asFix} />

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={blocked}
              className="cursor-pointer rounded-sm bg-brand px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.submit}
            </button>
            <Link
              to={href(locale, adminDraftPath(view.researchId, view.draftId))}
              className="text-ink-muted text-sm underline"
            >
              {t.cancel}
            </Link>
          </div>
        </Form>
      </Card>
    </Page>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 rounded-sm border border-accent bg-surface px-4 py-2 text-sm">{children}</p>
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
      <p className="mb-3 text-ink-muted text-sm">{t.blockedHint}</p>
      <ul className="flex flex-col gap-3">
        {view.blocks.map((block) => (
          <li key={`${block.kind}:${block.datasetId ?? ""}`} className="text-sm">
            <p className="text-danger">
              {block.kind === "hum-label-missing" ? t.humLabelMissing : t.datasetIdMissing}
            </p>
            <PinForm
              kind={block.kind === "hum-label-missing" ? "hum" : "dataset"}
              datasetId={block.datasetId}
              suggestion={block.suggestion}
              locale={view.locale}
            />
          </li>
        ))}
      </ul>
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
    <Form method="post" className="mt-1 flex items-center gap-2">
      <input type="hidden" name="intent" value="pin" />
      <input type="hidden" name="kind" value={kind} />
      {datasetId !== null && <input type="hidden" name="datasetId" value={datasetId} />}
      <input
        type="text"
        name="label"
        required
        defaultValue={suggestion ?? ""}
        placeholder={kind === "hum" ? detail.pinPlaceholder : detail.pinDatasetPlaceholder}
        className="rounded-sm border border-line px-2 py-1 text-sm"
      />
      <button type="submit" className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm">
        {t.pin}
      </button>
    </Form>
  )
}

function FindingGroup({ group, locale }: { group: PublishGroupView, locale: PublishPageView["locale"] }) {
  const t = messagesFor(locale).admin.publish

  return (
    <li>
      <details>
        <summary className="cursor-pointer text-sm">
          {`${t.kinds[group.kind]} ${group.count}`}
        </summary>
        <ul className="mt-2 ml-4 flex flex-col gap-1 text-sm">
          {group.places.map((place) => (
            <li key={place.label} className="flex flex-wrap items-center gap-2">
              {place.href === null
                ? <span>{place.label}</span>
                : <Link to={place.href}>{place.label}</Link>}
              <span className="text-ink-muted text-xs">{place.count}</span>
              {place.note !== null && <span className="text-ink-muted text-xs">{place.note}</span>}
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function Changes({ view, asFix }: { view: PublishPageView, asFix: boolean }) {
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
            <ul className="flex flex-col gap-2 text-sm">
              {view.researchFields !== null && view.researchFields > 0 && (
                <li>{t.researchChanged(view.researchFields)}</li>
              )}
              {view.datasetChanges.length > 0 && (
                <li>
                  <p>{t.datasetsChanged}</p>
                  <ul className="mt-1 ml-4 flex flex-col gap-1">
                    {view.datasetChanges.map((change) => (
                      <li key={change.datasetId} className="flex flex-wrap items-center gap-2">
                        <Link to={change.href}>{change.label ?? change.datasetId}</Link>
                        <span className="text-ink-muted text-xs">
                          {change.isNew
                            ? t.newDataset
                            : t.affects(asFix && change.affectsIfFix !== null
                                ? change.affectsIfFix
                                : change.affects)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              {view.listingAdded.length > 0 && <li>{t.listingAdded(view.listingAdded.length)}</li>}
              {view.listingRemoved.length > 0 && (
                <li>{t.listingRemoved(view.listingRemoved.length)}</li>
              )}
            </ul>
          )}
    </Section>
  )
}
