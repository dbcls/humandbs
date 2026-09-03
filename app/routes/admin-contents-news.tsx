import { Form, Link } from "react-router"

import { newsListAction, newsListPage } from "~/admin/contents.server"
import { adminContentsPath, adminNewsListPath, adminNewsPath } from "~/admin/urls"
import { Stack } from "~/components/base"
import { ResultLine, StateBadges } from "~/components/contents"
import { Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, PageLinks, Section, Table, Td } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-news"

/**
 * The announcements, newest first, unpublished ones included.
 *
 * **Undated items sort to the top.** The date is the announcement's own — it is
 * what the public listing orders by — so an item without one is a draft that
 * has not been given its day yet.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return newsListPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return newsListAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.contents.news.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsNews({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, items, page, pageCount } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <PageHead label={t.news.heading}>
        <Link to={href(locale, adminContentsPath())} className="text-white">{t.backToTree}</Link>
      </PageHead>
      <Card>
        <Stack gap="block">
          <ResultLine result={actionData} locale={locale} />

          {items.length === 0
            ? <Empty>{t.news.none}</Empty>
            : (
                <Stack gap="normal">
                  <Table headers={[t.news.publishedAt, t.title, t.state]}>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <Td className="text-nowrap">
                          <Link to={href(locale, adminNewsPath(item.id))}>
                            {item.publishedAt ?? t.news.undated}
                          </Link>
                        </Td>
                        <Td>{item.title}</Td>
                        <Td><StateBadges states={item.states} locale={locale} /></Td>
                      </tr>
                    ))}
                  </Table>
                  <PageLinks
                    label={messagesFor(locale).search.pagination}
                    page={page}
                    pageCount={pageCount}
                    at={(at) => href(locale, `${adminNewsListPath()}?page=${at}`)}
                    previous={messagesFor(locale).search.previousPage}
                    next={messagesFor(locale).search.nextPage}
                  />
                </Stack>
              )}

          <Section title={t.news.add}>
            <Form method="post">
              <input type="hidden" name="intent" value="create-news" />
              <Submit>{t.news.add}</Submit>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
