import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Badge, Heading, Stack } from "~/components/base"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Answered, Editing, Field, Submit, Unsaved } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Page, Section } from "~/components/page"
import { asLocalInput, minuteOf } from "~/dates"
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
function titleOf(editors: { draftTitle: string }[]): string | null {
  return editors.map((editor) => editor.draftTitle).find((one) => one !== "") ?? null
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
  const { locale, publishedAt, scheduled, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  const save = messagesFor(locale).admin.editor.save

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.news.itemHeading}>
            <AdminBack
              to={href(locale, adminNewsListPath())}
              label={t.news.backToList}
              icon="chevron-left"
            />
          </Heading>

          {/*
            **The field names the zone and the value carries no offset.** The
            clock in the box is the one the announcement goes out on, and a
            reader with no way to check which zone that is would have to guess
            from the value — which reads the same either way.

            **A date still ahead is said here rather than by the published
            state.** The two languages each have their own state and this date
            belongs to the announcement as a whole, so a word about waiting in
            the state would be the same word in two places saying something
            about a third.
          */}
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

          {/* **The announcement is deleted one language at a time**, the way an
              article is: there is nothing to it apart from what it says, so
              taking away the last thing it says takes it away. */}
          <LocaleEditors
            editors={editors}
            locale={locale}
            lastWarning={t.news.removeLastWarning}
          />
        </Stack>
      </Card>
    </Page>
  )
}
