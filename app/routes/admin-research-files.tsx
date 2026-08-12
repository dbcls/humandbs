import { data, Link } from "react-router"

import { adminResearchFilesPath, adminResearchPath, fileUploadPath } from "~/admin/urls"
import { BoxTable, UploadPanel } from "~/components/files"
import { Card, Empty, Page, PageHead, PageLinks, Section } from "~/components/page"
import { formatSize } from "~/files/box"
import { filesAction, filesPage } from "~/files/pages.server"
import { messagesFor } from "~/i18n/messages"
import { href, readLocale } from "~/public/urls"

import type { Route } from "./+types/admin-research-files"

/**
 * The research's box.
 *
 * **It is not under a draft.** The box belongs to the research, holds no
 * versions, and making a file public is a separate operation from publishing a
 * version — putting it inside a draft would say the two happen together
 * (docs/files.md の「画面」).
 *
 * Switching is queued rather than done: a copy across buckets moves the actual
 * bytes, and the largest file here is measured in hundreds of gigabytes. The
 * screen says what is in flight and does not wait for it.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  return filesPage(request, locale, params.researchId)
}

export async function action({ request, params }: Route.ActionArgs) {
  const locale = readLocale(new URL(request.url).pathname).locale
  const result = await filesAction(request, locale, params.researchId)
  return result instanceof Response ? result : data(result, { status: 400 })
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const label = loaderData.humLabel ?? messages.admin.detail.heading
  return [
    { title: `${messages.admin.files.heading} - ${label} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminResearchFiles({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.files

  return (
    <Page>
      <PageHead label={`${view.humLabel ?? messages.admin.detail.heading} - ${t.heading}`}>
        <Link to={href(locale, adminResearchPath(view.researchId))} className="text-white">
          {messages.admin.detail.heading}
        </Link>
      </PageHead>
      <Card>
        {actionData?.status === "nothing-selected" && <Notice>{t.nothingSelected}</Notice>}
        {actionData?.status === "no-box" && <Notice>{t.publishNeedsLabel}</Notice>}
        {view.humLabel === null && <Notice>{t.noBox}</Notice>}

        <Section title={t.upload}>
          <UploadPanel
            locale={locale}
            endpoint={fileUploadPath(view.researchId)}
            threshold={view.multipartThreshold}
            partSize={view.partSize}
          />
        </Section>

        <Section title={t.heading}>
          {view.rows === null
            ? <Empty>{t.unavailable}</Empty>
            : (
                <>
                  <p className="mb-3 text-ink-muted text-sm">
                    {t.summary(view.total, formatSize(view.totalBytes))}
                  </p>
                  {view.switching > 0 && (
                    <p className="mb-3 text-accent text-sm">{t.switching(view.switching)}</p>
                  )}
                  <BoxTable locale={locale} rows={view.rows} humLabel={view.humLabel} />
                  <PageLinks
                    label={messages.search.pagination}
                    page={view.page}
                    pageCount={view.pageCount}
                    at={(to) => href(
                      locale,
                      `${adminResearchFilesPath(view.researchId)}?page=${to}`,
                    )}
                    previous={messages.search.previousPage}
                    next={messages.search.nextPage}
                  />
                </>
              )}
        </Section>
      </Card>
    </Page>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded border border-accent bg-surface px-4 py-2 text-sm">{children}</p>
  )
}
