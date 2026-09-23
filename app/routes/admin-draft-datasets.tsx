import { data, Form, Link } from "react-router"

import { draftDatasetListAction, draftDatasetListPage } from "~/admin/pages.server"
import type { DraftDatasetRow } from "~/admin/queries.server"
import {
  adminDraftDatasetPath,
  adminDraftUpstreamPath,
  adminResearchPath,
  adminUpstreamDatasetPath,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Confirm, Heading, IconButton, Stack } from "~/components/base"
import { Answered, Result, Submit } from "~/components/form"
import { Icon, type IconName } from "~/components/icons"
import { Card, Page, Section, Table, Td } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
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

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.draft.datasets, loaderData.humLabel) },
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
              where it stands there. The table stays when empty: the column
              names say what would stand here. */}
          <Section title={t.listing} note={t.listingNote}>
            <Table
              align="middle"
              headers={[
                messages.dataset.datasetId,
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
          </Section>

          <div className="flex flex-wrap items-center gap-4">
            <Form method="post">
              <input type="hidden" name="revision" value={view.revision} />
              <Submit intent="create-dataset" icon={<Icon name="plus" />}>{t.createDataset}</Submit>
            </Form>
            {/* The two ways upstream can fill this draft: a whole application,
                taken in through this research's own branches, and a single
                accession. */}
            <Link
              to={href(locale, adminDraftUpstreamPath(view.researchId, view.draftId))}
              className="text-sm"
            >
              {messages.admin.templates.openApplication}
            </Link>
            <Link
              to={href(locale, adminUpstreamDatasetPath(view.researchId, view.draftId))}
              className="text-sm"
            >
              {messages.admin.templates.openDataset}
            </Link>
          </div>
        </Stack>
      </Card>
    </Page>
  )
}

/**
 * One dataset as this draft sees it: where it stands in the order, and the way
 * to take it out of the research.
 */
function DatasetRow({ row, at, locale, researchId, draftId, revision }: {
  row: DraftDatasetRow
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
  return (
    <tr>
      <Td nowrap>
        <Link to={href(locale, adminDraftDatasetPath(researchId, draftId, row.id))}>{name}</Link>
      </Td>
      <Td>
        <span className="flex flex-wrap items-center gap-2">
          {row.published && <Mark>{t.publishedDataset}</Mark>}
          {row.edited && <Mark>{t.edited}</Mark>}
          {row.isOwn && <Mark>{t.own}</Mark>}
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

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-line px-1.5 py-0.5 text-ink-muted text-xs">
      {children}
    </span>
  )
}
