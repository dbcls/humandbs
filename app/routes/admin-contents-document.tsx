import { Form, Link } from "react-router"

import { documentAction, documentPage } from "~/admin/contents.server"
import { adminSeriesPath } from "~/admin/urls"
import { Confirm, Heading, Stack } from "~/components/base"
import { LocaleEditors, ResultLine } from "~/components/contents"
import { Answered, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Empty, Page, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
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
    { title: pageTitle(messages, messages.admin.contents.documentHeading, loaderData.slug) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsDocument({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, id, slug, seriesOf, editors } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.documentHeading} aside={slug} />

          <Section title={t.address}>
            {/* Everything about the series as a whole — which revision is
                current, what the next one is numbered, retiring the lot — is on
                the series' own screen, so saying which series this belongs to
                is also the way there. */}
            {seriesOf !== null && (
              <Empty>
                <Link to={href(locale, adminSeriesPath(seriesOf.id))}>
                  {t.revisionOf(seriesOf.slug, seriesOf.number)}
                </Link>
                {seriesOf.isCurrent && ` — ${t.isCurrent}`}
              </Empty>
            )}
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <Field label={t.slug} name="slug" value={slug} width="w-96" />
              <Submit intent="rename" icon={<Icon name="edit" />}>{t.rename}</Submit>
            </Form>
            <Empty>{t.renameNote}</Empty>

            {seriesOf === null && (
              <Form method="post" className="flex flex-wrap items-end gap-3">
                <Field label={t.versionNumber} name="number" type="number" width="w-24" value="1" />
                <Submit intent="cut-into-version" icon={<Icon name="copy" />}>{t.cut}</Submit>
                <Empty>{t.cutNote(slug)}</Empty>
              </Form>
            )}
          </Section>

          <LocaleEditors editors={editors} locale={locale} />

          <Section title={t.removeHeading}>
            <Form method="post">
              <Confirm
                label={t.removeDocument}
                title={t.removeDocumentTitle(slug)}
                warning={t.removeNote}
                confirm={t.removeDocumentConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-document" />
                <input type="hidden" name="documentId" value={id} />
              </Confirm>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
