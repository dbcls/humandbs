import { Form, Link } from "react-router"

import { newsAction, newsPage } from "~/admin/contents.server"
import { adminNewsListPath } from "~/admin/urls"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
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

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.contents.news.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNewsItem({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, publishedAt, editors } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <PageHead label={t.news.heading}>
        <Link to={href(locale, adminNewsListPath())} className="text-white">{t.news.backToList}</Link>
      </PageHead>
      <Card>
        <ResultLine result={actionData} locale={locale} />

        <Section title={t.news.publishedAt}>
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col text-sm">
              {t.news.publishedAt}
              <input
                type="date"
                name="publishedAt"
                defaultValue={publishedAt ?? ""}
                className="rounded border border-line bg-surface-input px-2 py-1"
              />
            </label>
            <Submit intent="set-date">{t.save}</Submit>
          </Form>
        </Section>

        <LocaleEditors editors={editors} locale={locale} />

        <Section title={t.removeHeading}>
          <Form method="post" className="flex flex-wrap items-center gap-3">
            <Submit intent="delete-news">{t.news.remove}</Submit>
            <Empty>{t.removeNote}</Empty>
          </Form>
        </Section>
      </Card>
    </Page>
  )
}
