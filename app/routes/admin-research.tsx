import { data, Form, Link } from "react-router"

import { HUM_LABEL_PATTERN } from "~/admin/labels"
import { researchDetailAction, researchDetailPage } from "~/admin/pages.server"
import type { AdminDraftRow } from "~/admin/queries.server"
import {
  adminDraftPath,
  adminDraftPublishPath,
  adminDraftReviewPath,
  adminResearchFilesPath,
  adminResearchListPath,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Badge, Confirm, Heading, Note, Stack } from "~/components/base"
import { Answered, Checkbox, Field, Result, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Counted, Empty, Page, Section, Table, Td } from "~/components/page"
import { formatSize } from "~/files/box"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href, readLocale, researchPath } from "~/public/urls"
import type { DraftReviewSummary } from "~/review/queries.server"

import type { Route } from "./+types/admin-research"

/**
 * One research: which labels are pinned to it, what has been published, and
 * what is being worked on.
 *
 * A research is addressed by its identity here rather than by its hum label,
 * because a research exists before a number has been issued for it — and
 * because a label can be corrected without the page moving.
 *
 * **The ledger is managed here rather than at publish time.** A label is
 * attached to an identity, not to a version, and correcting one is an everyday
 * operation: the number originates as free text in a system upstream that has
 * typed it wrong before. Taking a version out of sight lives here for the same
 * reason — it is an operation on the version, not on anything being written.
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

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.detail.heading, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearch({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.detail

  /**
   * **撥ねられた理由は、その ID を打った欄の下に立つ。** 画面はデータセットの
   * 数だけ同じ形の欄を持つので、画面の頭にまとめて出すと、どの欄の話なのかを
   * 読む人が数えることになる。
   */
  const pinTrouble = (subjectId: string): string | undefined => {
    if (actionData === undefined || actionData.status === "conflict") return undefined
    if (actionData.subjectId !== subjectId) return undefined
    return actionData.status === "taken" ? t.pinTaken : t.pinMalformed
  }

  /**
   * **画面ぜんたいに向いた答えだけが浮く。**撥ねられた ID は打った欄の下に
   * 立つので (上)、そちらをここに渡すと、どの欄の話かを言わない箱が窓の上に
   * 出ることになる。
   */
  const answer = actionData?.status === "conflict" ? actionData : null

  return (
    <Page>
      <Answered answer={answer} locale={locale}>
        <Result ok={false}>{t.discardConflict}</Result>
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchListPath())}
              label={t.backToList}
              icon="chevron-left"
            />
          </Heading>

          <Section title={t.labels} note={t.labelsNote}>
            <Stack gap="normal">
              {view.labels.length === 0
                ? <Empty>{t.unpinned}</Empty>
                : (
                    /*
                      **ID は縦に読み、3 つの列で揃える。**1 行に流すと 2 本目の
                      ID が 1 本目の操作の隣に来て、どの外すがどの ID のものか
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
                          <Badge tone={label.isPrimary ? "brand" : "muted"}>
                            {label.isPrimary ? t.primary : t.secondary}
                          </Badge>
                          <span>{label.label}</span>
                          <Unpin pinId={label.id} subject={label.label} locale={locale} />
                        </li>
                      ))}
                    </ul>
                  )}
              <PinForm
                kind="hum"
                placeholder={t.pinPlaceholder}
                suggestion={null}
                problem={pinTrouble(view.researchId)}
                locale={locale}
              />
            </Stack>
          </Section>

          <Section title={t.versions} note={t.versionsNote}>
            {/* 0 件でも表は消さない — 列の名前がここに何が並ぶかを言っている。 */}
            {/* **状態の列を持たない。** 並んでいることが公開されていることなので、
                行が言えるのは「出ている」だけになる。 */}
            <Counted locale={locale} total={view.versions.length} />
            <Table
              align="middle"
              headers={[
                t.version,
                t.releaseDate,
                /* The column of things to press names itself for anyone reading
                   the row aloud and nowhere else. */
                <span key="actions" className="sr-only">{messages.admin.actions}</span>,
              ]}
              whenEmpty={t.noVersions}
            >
              {view.versions.map((version) => (
                <tr key={version.id}>
                  <Td className="whitespace-nowrap">
                    {view.humLabel === null
                      ? `v${version.number}`
                      : (
                          <Link to={href(locale, `${researchPath(view.humLabel)}/v${version.number}`)}>
                            {`v${version.number}`}
                          </Link>
                        )}
                  </Td>
                  <Td className="whitespace-nowrap">{version.releaseDate}</Td>
                  <Td holds="control">
                    <Withdraw versionId={version.id} number={version.number} locale={locale} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title={t.drafts} note={t.draftsNote}>
            <Stack gap="normal">
              <Form method="post">
                <Submit intent="create-draft" icon={<Icon name="plus" />}>{t.createDraft}</Submit>
              </Form>
              <Counted locale={locale} total={view.drafts.length} />
              {view.drafts.length === 0
                ? <Empty>{t.noDrafts}</Empty>
                : (
                    <ul className="flex flex-col gap-3">
                      {view.drafts.map((draft) => (
                        <DraftRow
                          key={draft.id}
                          draft={draft}
                          review={view.reviews.find((row) => row.draftId === draft.id) ?? null}
                          researchId={view.researchId}
                          locale={locale}
                        />
                      ))}
                    </ul>
                  )}
            </Stack>
          </Section>

          <Section title={t.datasets}>
            <Counted locale={locale} total={view.datasets.length} />
            {view.datasets.length === 0
              ? <Empty>{t.noDatasets}</Empty>
              : (
                  <Stack gap="tight" as="ul">
                    {view.datasets.map((row) => (
                      // The same grouping the research IDs above take: what is
                      // read, then a step, then what acts on it.
                      <li key={row.id} className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="flex items-center gap-2">
                          <span>{row.label ?? messages.admin.editor.unpinnedDataset}</span>
                          {!row.published && (
                            <span className="text-ink-muted text-xs">{t.unpublishedDataset}</span>
                          )}
                        </span>
                        {row.pinId === null
                          ? (
                              <PinForm
                                kind="dataset"
                                datasetId={row.id}
                                placeholder={t.pinDatasetPlaceholder}
                                suggestion={view.datasetIdSuggestion}
                                problem={pinTrouble(row.id)}
                                locale={locale}
                              />
                            )
                          : (
                              <Unpin
                                pinId={row.pinId}
                                subject={row.label ?? messages.admin.editor.unpinnedDataset}
                                locale={locale}
                              />
                            )}
                      </li>
                    ))}
                  </Stack>
                )}
          </Section>

          <Section title={messages.admin.files.heading}>
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-ink-muted">
                {view.box === null
                  ? messages.admin.files.unavailable
                  : messages.admin.files.summary(view.box.count, formatSize(view.box.bytes))}
              </span>
              <Link to={href(locale, adminResearchFilesPath(view.researchId))}>
                {messages.admin.files.open}
              </Link>
            </p>
          </Section>

          {/*
            Last, because it takes the whole research with it. The labels come
            free again afterwards, and what is left of it is the event.
          */}
          <Section title={t.deleteResearch}>
            <Form method="post">
              <Confirm
                label={t.deleteResearch}
                title={t.deleteResearchTitle(view.humLabel ?? t.heading)}
                warning={t.deleteResearchWarning}
                confirm={t.deleteResearchConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-research" />
              </Confirm>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * Taking a version back. Nothing beside it puts it back, because what comes out
 * is a draft: the way back is to edit it and publish it under the number it
 * left free.
 */
function Withdraw({ versionId, number, locale }: {
  versionId: string
  number: number
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail
  return (
    <Form method="post">
      <Confirm
        label={t.withdraw}
        title={t.withdrawTitle(`v${number}`)}
        warning={t.withdrawWarning}
        confirm={t.withdrawConfirm}
        cancel={t.cancel}
        size="row"
      >
        <input type="hidden" name="intent" value="withdraw-version" />
        <input type="hidden" name="versionId" value={versionId} />
      </Confirm>
    </Form>
  )
}

function Unpin({ pinId, subject, locale }: { pinId: string, subject: string, locale: Locale }) {
  const t = messagesFor(locale).admin.detail
  return (
    <Form method="post">
      <Confirm
        label={t.unpin}
        title={t.unpinTitle(subject)}
        warning={t.unpinWarning}
        confirm={t.unpinConfirm}
        cancel={t.cancel}
        size="row"
      >
        <input type="hidden" name="intent" value="unpin" />
        <input type="hidden" name="pinId" value={pinId} />
      </Confirm>
    </Form>
  )
}

/**
 * Attaching a label. Making it primary demotes the one that was, which keeps
 * the old spelling resolving: moving a label is not taking it away. What has to
 * hold is that no two identities carry the same one, and that is the ledger's
 * unique constraint rather than anything this form can check.
 */
function PinForm({ kind, datasetId, placeholder, suggestion, problem, locale }: {
  kind: "hum" | "dataset"
  datasetId?: string
  placeholder: string
  suggestion: string | null
  /** 直前の試みが撥ねられた理由。**この欄に打たれたものについてだけ**。 */
  problem?: string
  locale: Locale
}) {
  const t = messagesFor(locale).admin.detail

  return (
    <Stack gap="tight">
      {/* **1 行に並ぶものは、中心で揃える。** 名前を欄の上に置くと行が 2 段になり、
          下端で揃えた欄・チェック・ボタンの中心が 24px 以上ばらける。名前は
          読み上げのために残し、形の見本は欄の中の placeholder が言う。 */}
      <Form method="post" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="kind" value={kind} />
        {datasetId !== undefined && <input type="hidden" name="datasetId" value={datasetId} />}
        <Field
          label={t.pinLabel}
          name="label"
          value={kind === "dataset" ? suggestion ?? undefined : undefined}
          placeholder={placeholder}
          // **研究 ID の形は 1 つしかない。** dataset の ID は JGAD にも NHA にも
          // なるので、形を決めているのは hum のほうだけ。
          pattern={kind === "hum" ? HUM_LABEL_PATTERN : undefined}
          hideLabel
        />
        <Checkbox label={t.pinPrimary} name="isPrimary" checked />
        <Submit intent="pin" icon={<Icon name="link" />}>{t.pinSubmit}</Submit>
      </Form>
      {problem !== undefined && <Note kind="danger" live>{problem}</Note>}
    </Stack>
  )
}

/**
 * Discarding asks twice. It takes the whole draft with it and cannot be undone,
 * and the revision travels with the request so a draft somebody has edited in
 * the meantime is not thrown away on the strength of a stale screen.
 */
function DraftRow({ draft, review, researchId, locale }: {
  draft: AdminDraftRow
  review: DraftReviewSummary | null
  researchId: string
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.detail
  const flags = messages.admin.research.flags

  return (
    <li className="rounded border border-line px-4 py-3">
      <Stack gap="tight">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link to={href(locale, adminDraftPath(researchId, draft.id))}>{t.edit}</Link>
            <Link to={href(locale, adminDraftPublishPath(researchId, draft.id))}>
              {messages.admin.publish.open}
            </Link>
            <Link to={href(locale, adminDraftReviewPath(researchId, draft.id))}>{t.review}</Link>
            {review !== null && (
              <span className="text-ink-muted text-xs">
                {review.shared ? t.shared : review.expired ? t.shareExpired : t.notShared}
              </span>
            )}
            {review !== null && review.unresolved > 0 && (
              <Badge tone="accent">{t.openComments(review.unresolved)}</Badge>
            )}
            <span className="text-ink-muted text-xs">
              {`${t.updatedAt}: ${draft.updatedAt.slice(0, 10)}`}
            </span>
            <span className="text-ink-muted text-xs">
              {draft.copiedFromNumber === null
                ? t.copiedFromNone
                : t.copiedFrom(draft.copiedFromNumber)}
            </span>
            {draft.flags.unsettled && <Badge tone="accent">{flags.unsettled}</Badge>}
            {draft.flags.untranslated && <Badge tone="accent">{flags.untranslated}</Badge>}
          </div>
          <Form method="post">
            <Confirm
              label={t.discard}
              title={t.discardTitle}
              warning={t.discardWarning}
              confirm={t.discardConfirm}
              cancel={t.cancel}
              size="row"
            >
              <input type="hidden" name="intent" value="discard-draft" />
              <input type="hidden" name="draftId" value={draft.id} />
              <input type="hidden" name="revision" value={draft.revision} />
            </Confirm>
          </Form>
        </div>
      </Stack>
    </li>
  )
}
