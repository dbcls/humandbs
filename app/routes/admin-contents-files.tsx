import { data, Form, Link } from "react-router"

import { adminContentFilesPath, adminContentsPath, contentFileUploadPath } from "~/admin/urls"
import { UploadPanel } from "~/components/files"
import { Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, PageLinks, Section, Table, Td } from "~/components/page"
import { formatSize } from "~/files/box"
import { commonFilesAction, commonFilesPage } from "~/files/pages.server"
import { messagesFor } from "~/i18n/messages"
import { filePath, href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-contents-files"

/**
 * The `common/` box: the images and PDFs a document body links to.
 *
 * **There is no private side and nothing to switch.** This box belongs to no
 * research, and a file put here is fetchable from that moment — which is why
 * both putting one in and taking one out are written into the audit trail,
 * unlike an upload into a research's box (docs/publishing.md の「証跡」).
 *
 * A body links to a file by writing its address, and nothing keeps that link
 * alive: deleting a file leaves whatever pointed at it pointing at nothing.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  return commonFilesPage(request, locale)
}

export async function action({ request }: Route.ActionArgs) {
  const { locale } = readLocale(new URL(request.url).pathname)
  const answer = await commonFilesAction(request, locale)
  return answer instanceof Response ? answer : data(answer, { status: 400 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.contents.files.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsFiles({ loaderData }: Route.ComponentProps) {
  const view = loaderData
  const { locale } = view
  const t = messagesFor(locale).admin.contents.files

  return (
    <Page>
      <PageHead label={t.heading}>
        <Link to={href(locale, adminContentsPath())} className="text-white">
          {messagesFor(locale).admin.contents.backToTree}
        </Link>
      </PageHead>
      <Card>
        <p className="mb-4 text-ink-muted text-sm">{t.note}</p>

        <Section title={t.upload}>
          <UploadPanel
            locale={locale}
            endpoint={contentFileUploadPath()}
            threshold={view.multipartThreshold}
            partSize={view.partSize}
          />
        </Section>

        <Section title={t.heading}>
          {view.rows === null && <Empty>{t.failed}</Empty>}
          {view.rows !== null && view.rows.length === 0 && <Empty>{t.none}</Empty>}
          {view.rows !== null && view.rows.length > 0 && (
            <Form method="post">
              <Table headers={["", t.name, t.size, t.updatedAt, t.url]}>
                {view.rows.map((row) => (
                  <tr key={row.name}>
                    <Td>
                      <input type="checkbox" name="name" value={row.name} aria-label={row.name} />
                    </Td>
                    <Td>{row.name}</Td>
                    <Td className="text-nowrap">{formatSize(row.size)}</Td>
                    <Td className="text-nowrap">{row.updatedAt.slice(0, 10)}</Td>
                    <Td>
                      <code className="text-xs">{filePath("common", row.name)}</code>
                    </Td>
                  </tr>
                ))}
              </Table>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Submit intent="delete">{t.removeFile}</Submit>
                <Empty>{t.removeConfirm}</Empty>
              </div>
            </Form>
          )}
          <PageLinks
            label={messagesFor(locale).search.pagination}
            page={view.page}
            pageCount={view.pageCount}
            at={(page) => href(locale, `${adminContentFilesPath()}?page=${page}`)}
            previous={messagesFor(locale).search.previousPage}
            next={messagesFor(locale).search.nextPage}
          />
        </Section>
      </Card>
    </Page>
  )
}
