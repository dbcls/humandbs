import { Form } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { Confirm, Heading, Stack } from "~/components/base"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Answered, Editing, Field, Submit, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"

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
function titleOf(editors: { draftTitle: string }[]): string | null {
  return editors.map((editor) => editor.draftTitle).find((one) => one !== "") ?? null
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const words = messages.admin.contents
  const label = titleOf(loaderData.editors) ?? loaderData.publishedAt ?? words.news.undated
  return [
    { title: pageTitle(messages, words.news.itemHeading, label) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, publishedAt, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  /*
    **What is about to be deleted, named at the moment of deleting it.** This is
    the one place the announcement's own words belong: a confirmation has to say
    which thing it is about, and a value that moves as the form is typed into is
    exactly right there — it names what is on screen now. An item with neither
    language written is named by its date, and one with no date either by the
    word for that.
  */
  const naming = titleOf(editors) ?? publishedAt ?? t.news.undated

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.news.itemHeading} />

          <Section title={t.news.publishedAt}>
            <Editing method="post" className="flex flex-wrap items-end gap-2">
              <Field
                label={t.news.publishedAt}
                name="publishedAt"
                type="date"
                value={publishedAt ?? ""}
              />
              <Submit intent="set-date" icon={<Icon name="save" />} saves>{t.save}</Submit>
              <Unsaved locale={locale} />
            </Editing>
          </Section>

          <LocaleEditors editors={editors} locale={locale} />

          <Section title={t.removeHeading}>
            <Form method="post">
              <Confirm
                label={t.news.remove}
                title={t.news.removeTitle(naming)}
                warning={t.removeNote}
                confirm={t.news.removeConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-news" />
              </Confirm>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
