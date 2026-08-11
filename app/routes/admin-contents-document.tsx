import { Form, Link } from "react-router"

import { documentAction, documentPage } from "~/admin/contents.server"
import { adminContentsPath } from "~/admin/urls"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Field, Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-document"

/**
 * One document: its address, and each language's body and published state.
 *
 * **The slug can be corrected but doing so moves the page.** External
 * references — submission metadata, other bodies, the navigation constants —
 * are not rewritten by anything, so the screen says as much rather than
 * refusing.
 *
 * **"Cut into a version"** is how a page that never had revisions gets one: the
 * body moves to `{slug}/version/1` and the address it had becomes a pointer at
 * it. Nothing is copied, so the same text never lives at two addresses.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await documentPage(request, params.documentId)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request, params }: Route.ActionArgs) {
  return documentAction(request, params.documentId)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${loaderData.slug} - ${messages.admin.contents.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsDocument({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, id, slug, seriesOf, editors } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <PageHead label={slug}>
        <Link to={href(locale, adminContentsPath())} className="text-white">{t.backToTree}</Link>
      </PageHead>
      <Card>
        <ResultLine result={actionData} locale={locale} />

        <Section title={t.address}>
          {seriesOf !== null && (
            <Empty>
              {t.revisionOf(seriesOf.slug, seriesOf.number)}
              {seriesOf.isCurrent && ` — ${t.isCurrent}`}
            </Empty>
          )}
          <Form method="post" className="mt-2 flex flex-wrap items-end gap-2">
            <Field label={t.slug} name="slug" value={slug} width="w-96" />
            <Submit intent="rename">{t.rename}</Submit>
          </Form>
          <Empty>{t.renameNote}</Empty>

          {seriesOf === null && (
            <Form method="post" className="mt-4 flex flex-wrap items-center gap-3">
              <Submit intent="cut-into-version">{t.cut}</Submit>
              <Empty>{t.cutNote(slug)}</Empty>
            </Form>
          )}
        </Section>

        <LocaleEditors editors={editors} locale={locale} />

        <Section title={t.removeHeading}>
          <Form method="post" className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="documentId" value={id} />
            <Submit intent="delete-document">{t.removeDocument}</Submit>
            <Empty>{t.removeNote}</Empty>
          </Form>
        </Section>
      </Card>
    </Page>
  )
}
