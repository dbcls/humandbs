import { data, Form } from "react-router"

import { draftDatasetListAction, draftDatasetListPage } from "~/admin/pages.server"
import type { DraftDatasetListView } from "~/admin/pages.server"
import {
  adminDraftDatasetPath,
  adminResearchPath,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { AccessionSection } from "~/components/accession"
import { Confirm, Heading, IconButton, Stack, Stated } from "~/components/base"
import { Flag } from "~/components/flags"
import { Answered, Result, Submit } from "~/components/form"
import { Icon, type IconName } from "~/components/icons"
import { Card, Page, Table, Td } from "~/components/page"
import { DatasetCells, datasetColumns } from "~/components/research"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { adminWindowTitle } from "~/i18n/title"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-draft-datasets"

/**
 * The datasets of a research, as one draft sees them.
 *
 * **Everything about datasets is decided here** (docs/editing.md の「編集
 * フォーム」): the three ways of adding one, the order they go out in, taking
 * one out of the research, and the way to each one's description. The
 * research's own form holds none of it, so that a dataset has one screen to be
 * found on rather than two that each show half.
 *
 * **The draft does not choose which of them the version carries** — they
 * belong to the research, so every one of them goes out with the next publish
 * (docs/data-model.md の「research / experiment / dataset」). What the draft
 * decides is the order. The two marks are separate facts: one can be published
 * and never touched here, or made here and already written.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return draftDatasetListPage(request, locale, params)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await draftDatasetListAction(request, locale, params)
  // Both refusals leave everything as it was, and both deserve to be seen:
  // a stale screen is a conflict, and a dataset that is not this draft's to
  // destroy is a request that should never have been sent.
  return result instanceof Response ? result : data(result, { status: 409 })
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: adminWindowTitle(messages, location.pathname, messages.admin.draft.datasets, loaderData.humLabel) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminDraftDatasets({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.draft
  return (
    <Page>
      {/* Only a refusal is answered: what worked comes back as the listing it
          changed. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "conflict" && <Result ok={false}>{t.listConflict}</Result>}
        {actionData?.status === "refused" && <Result ok={false}>{t.deleteRefused}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          {/* Who else is in this draft belongs to its name rather than to the
              listing under it. */}
          <Stack gap="tight">
            <Heading title={t.datasets} aside={view.humLabel ?? undefined}>
              <AdminBack
                to={href(locale, adminResearchPath(view.researchId))}
                label={messages.admin.editor.backToResearch}
                icon="chevron-left"
              />
            </Heading>
          </Stack>

          {/* **The order is the public page's order**, so a row's arrows say
              where it stands there, and the columns are the public table's.
              **The table stands under the name with no section of its own** —
              the screen holds this one list, and the name already says what
              it is. The table stays when empty: the column names say what
              would stand here. */}
          <Table
            align="middle"
            headers={[
              ...datasetColumns(locale),
              t.state,
              <span key="order" className="sr-only">{t.order}</span>,
              <span key="actions" className="sr-only">{messages.admin.actions}</span>,
            ]}
            whenEmpty={t.noListed}
          >
            {view.rows.map((row, at) => (
              <DatasetRow
                key={row.id}
                row={row}
                at={{ index: at, of: view.rows.length }}
                locale={locale}
                researchId={view.researchId}
                draftId={view.draftId}
                revision={view.revision}
              />
            ))}
          </Table>

          {/* **No way to the take-in screen here.** Taking in is done to the
              research's contents, whose screen is where it starts; a second
              entrance here would be a second way to the same screen. */}
          <Form method="post">
            <input type="hidden" name="revision" value={view.revision} />
            <Submit intent="create-dataset" icon={<Icon name="plus" />}>{t.createDataset}</Submit>
          </Form>

          <AccessionSection
            locale={locale}
            researchId={view.researchId}
            draftId={view.draftId}
            revision={view.revision}
          />
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * One dataset as this draft sees it: the public page's cells for it, where it
 * stands in the order, and the way to take it out of the research. The id leads
 * to the dataset's editor rather than to its page.
 */
function DatasetRow({ row, at, locale, researchId, draftId, revision }: {
  row: DraftDatasetListView["rows"][number]
  /** Where it stands in the order the datasets go out in. */
  at: { index: number, of: number }
  locale: Locale
  researchId: string
  draftId: string
  revision: number
}) {
  const messages = messagesFor(locale)
  const t = messages.admin.draft
  const name = row.label ?? messages.admin.editor.unpinnedDataset
  const shown = row.shown ?? { id: row.id, label: name, typeOfData: null, accessType: null, datePublished: null }
  return (
    <tr>
      <DatasetCells
        row={shown}
        name={name}
        to={href(locale, adminDraftDatasetPath(researchId, draftId, row.id))}
        locale={locale}
      />
      {/* **Every row is published or not, so that is a mark and a word; only
          some rows are edited here, so that is the box** (docs/ui.md の
          「壊れるもの」). A dataset this draft made is the one kind that is not
          published, so "not published" says it without a word of its own. */}
      <Td>
        <span className="flex flex-wrap items-center gap-2">
          {row.published
            ? <Stated icon="eye">{t.publishedDataset}</Stated>
            : <Stated icon="lock">{messages.admin.detail.unpublishedDataset}</Stated>}
          {row.edited && <Flag kind="changed">{t.edited}</Flag>}
        </span>
      </Td>
      <Td holds="mark">
        <span className="flex gap-1">
          <Move id={row.id} by={-1} icon="chevron-up" label={t.moveUp} stuck={at.index === 0} revision={revision} />
          <Move id={row.id} by={1} icon="chevron-down" label={t.moveDown} stuck={at.index === at.of - 1} revision={revision} />
        </span>
      </Td>
      {/* **Every row can go, published or not** — a dataset belongs to the
          research, so taking it out is the one operation there is and the
          warning says what a published one loses (docs/data-model.md の
          「research / experiment / dataset」). */}
      <Td nowrap holds="control">
        <Form method="post">
          <input type="hidden" name="datasetId" value={row.id} />
          <input type="hidden" name="revision" value={revision} />
          <Confirm
            label={t.deleteDataset}
            title={t.deleteDatasetTitle(name)}
            warning={t.deleteWarning}
            confirm={t.deleteConfirm}
            cancel={messages.admin.detail.cancel}
            intent="delete-dataset"
            size="row"
          />
        </Form>
      </Td>
    </tr>
  )
}

/**
 * One step up or down. A form of its own, because the arrows are the only
 * things on the row that are told apart by direction rather than by intent.
 * **A glyph has no colour of its own to dim**, so the row's end is said by
 * the box around it.
 */
function Move({ id, by, icon, label, stuck, revision }: {
  id: string
  by: -1 | 1
  icon: IconName
  label: string
  /** At the end it points to, where there is nothing left to swap with. */
  stuck: boolean
  revision: number
}) {
  return (
    <Form method="post">
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="datasetId" value={id} />
      <input type="hidden" name="by" value={by} />
      <input type="hidden" name="intent" value="move-dataset" />
      <span className={stuck ? "opacity-50" : ""}>
        <IconButton name={icon} label={label} type="submit" disabled={stuck} />
      </span>
    </Form>
  )
}
