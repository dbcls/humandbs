import { data } from "react-router"

import {
  adminResearchFilesPath,
  adminResearchPath,
  fileUploadPath,
} from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Heading, Note, Stack } from "~/components/base"
import { BoxTable, UploadPanel } from "~/components/files"
import { Answered, Result } from "~/components/form"
import { Card, Page, Paging, Section } from "~/components/page"
import { formatSize } from "~/files/box"
import { filesAction, filesPage } from "~/files/pages.server"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
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
  return [
    { title: pageTitle(messages, messages.admin.files.heading, loaderData.humLabel) },
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
      {/* Only a refusal is answered: publishing, taking down and deleting all
          come back as the box they changed. */}
      <Answered answer={actionData} locale={locale}>
        {actionData?.status === "nothing-selected" && <Result ok={false}>{t.nothingSelected}</Result>}
        {actionData?.status === "no-box" && <Result ok={false}>{t.publishNeedsLabel}</Result>}
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} aside={view.humLabel ?? undefined}>
            <AdminBack
              to={href(locale, adminResearchPath(view.researchId))}
              label={t.backToResearch}
              icon="chevron-left"
            />
          </Heading>

          {/* Not an answer but a standing fact about this research: it stays on
              the screen (`docs/ui.md` の「管理画面の枠」). */}
          {view.humLabel === null && <Note kind="warning">{t.noBox}</Note>}

          <Section title={t.upload}>
            <UploadPanel
              locale={locale}
              endpoint={fileUploadPath(view.researchId)}
              threshold={view.multipartThreshold}
              partSize={view.partSize}
              hint={t.uploadHint}
            />
          </Section>

          <Section title={t.heading}>
            {view.rows === null
              ? <Note kind="danger">{t.unavailable}</Note>
              : (
                  <Stack gap="normal">
                    {/* What the box holds altogether, which the count beside the
                        page links does not say: a hundred rows of a thousand is
                        not how much storage this research is using. */}
                    <p className="text-ink-muted text-sm">{t.totalSize(formatSize(view.totalBytes))}</p>
                    {view.switching > 0 && (
                      <p className="text-accent text-sm">{t.switching(view.switching)}</p>
                    )}
                    <BoxTable locale={locale} rows={view.rows} humLabel={view.humLabel} />
                    <div className="flex justify-end">
                      <Paging
                        locale={locale}
                        total={view.total}
                        from={view.rangeFrom}
                        to={view.rangeTo}
                        page={view.page}
                        pageCount={view.pageCount}
                        at={(to) => href(
                          locale,
                          `${adminResearchFilesPath(view.researchId)}?page=${to}`,
                        )}
                      />
                    </div>
                  </Stack>
                )}
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
