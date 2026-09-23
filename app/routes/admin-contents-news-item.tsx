import { Form } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
import { Badge, Confirm, Stack } from "~/components/base"
import { ResultLine, useArticlePanes } from "~/components/contents"
import { DraftHead } from "~/components/draft-tools"
import { Answered, Editing, Field, Submit, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Page, Section } from "~/components/page"
import { asLocalInput, dayOf, minuteOf } from "~/dates"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-news-item"

/**
 * One announcement: the day it is dated, and each language's body and published
 * state.
 *
 * **The date belongs to the item rather than to a language**, and it is what
 * the public listing sorts by, so it is the announcement's own date rather than
 * a record of when a button was pressed.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await newsPage(request, params.newsId)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request, params }: Route.ActionArgs) {
  return newsAction(request, params.newsId)
}

/**
 * **The window's name says which announcement this is, and the screen does
 * not.** On the screen the title is already there, in the box it is typed into,
 * so a copy of it beside the heading is the same words twice — and one that
 * moves as the reader types. A window has nothing else: two announcements open
 * at once are told apart by their names or by nothing at all.
 *
 * Which announcement, in whichever language has been written: an item with
 * neither is named by its date, and one with no date either by the word for
 * that.
 */
/** The first language that has been given a title. */
function titleOf(editors: { title: string }[]): string | null {
  return editors.map((editor) => editor.title).find((one) => one !== "") ?? null
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const words = messages.admin.contents
  const dated = loaderData.publishedAt === null ? null : minuteOf(loaderData.publishedAt)
  const label = titleOf(loaderData.editors) ?? dated ?? words.news.undated
  return [
    { title: pageTitle(messages, words.news.itemHeading, label) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, id, publishedAt, scheduled, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  const save = messagesFor(locale).admin.editor.save

  /*
    **The date is the announcement's rather than a language's**, so it stands
    in the head with the name rather than in a language's form, and the page
    beside the form says the day under the title the way the public page does.

    **The clock in the box is the one the announcement goes out on** (JST), and
    a reader with no way to check which zone that is would have to guess from
    the value — which reads the same either way. **Waiting is said by the date,
    not by a state.** The two languages each have their own state and this date
    belongs to the announcement as a whole, so a word about waiting in the state
    would be the same word in two places saying something about a third.
  */
  const dating = (
    <Section title={t.news.publishedAt}>
      <Stack gap="tight">
        <Editing method="post" className="flex flex-wrap items-end gap-2">
          <Field
            label={t.news.publishedAtField}
            name="publishedAt"
            type="datetime-local"
            width="w-56"
            value={publishedAt === null ? "" : asLocalInput(publishedAt)}
          />
          <span className="flex items-center gap-2">
            <Submit intent="set-date" icon={<Icon name="save" />} saves>{save}</Submit>
            <Unsaved locale={locale} />
          </span>
        </Editing>
        {scheduled && (
          <p className="flex flex-wrap items-center gap-2 text-ink-muted text-sm">
            <Badge tone="accent">{t.news.scheduled}</Badge>
            {t.news.scheduledNote}
          </p>
        )}
      </Stack>
    </Section>
  )
  const panes = useArticlePanes({
    locale,
    remember: `news:${id}`,
    editors,
    result: actionData,
    dated: publishedAt === null ? null : dayOf(publishedAt),
  })

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Stack>
        {/* **The head is left for the announcement; the tools row is what
            stays while typing** (`draft-tools.tsx` の `DraftHead`/
            `DraftTools`). Between the two, the head's second line carries the
            publish date — the one thing here that belongs to the
            announcement rather than to a language. */}
        <DraftHead
          locale={locale}
          title={t.news.itemHeading}
          updating={null}
          back={{ to: href(locale, adminNewsListPath()), label: t.news.backToList, icon: "chevron-left" }}
          headExtra={(
            // **What takes the whole announcement away stands beside its
            // name**, next to the way back, rather than among the languages:
            // an announcement is made before anything is written into it,
            // and a control that lives on the last written language is out
            // of reach exactly when there is nothing to keep.
            <Form method="post">
              <Confirm
                label={t.news.remove}
                title={t.news.removeTitle}
                warning={t.news.removeWarning}
                confirm={t.news.removeConfirm}
                cancel={t.cancel}
                intent="delete-news"
              />
            </Form>
          )}
          overview={dating}
        />
        {panes.tools}
        {panes.view}
      </Stack>
    </Page>
  )
}
