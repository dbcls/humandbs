import { Form } from "react-router"

import { documentAction, documentPage } from "~/admin/contents.server"
import { adminContentsPath, adminSeriesPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
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
  const { locale, slug, seriesOf, editors } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          {/* **A revision's parent is its series, not the listing.** Versions
              are folded under the version-less slug, so the listing has no row
              for this screen and the way back to it is not the way anybody
              came. The series' screen is the one that lists revisions, and the
              listing is one step further up from there. */}
          <Heading title={t.documentHeading} aside={slug}>
            <AdminBack
              to={href(locale, seriesOf === null
                ? adminContentsPath()
                : adminSeriesPath(seriesOf.id))}
              label={seriesOf === null ? t.backToList : t.backToSeries}
              icon="chevron-left"
            />
          </Heading>

          <Section title={t.address}>
            {/* **What a changed slug breaks is said at the moment of changing
                it, not beside the box.** The address is the one thing here that
                readers hold, and a line under the field is read once and then
                stops being read; the panel stands in the way of the press. */}
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <Field label={t.slug} name="slug" value={slug} width="w-96" />
              <Confirm
                label={t.rename}
                title={t.renameTitle}
                warning={t.renameNote}
                confirm={t.renameConfirm}
                cancel={t.cancel}
                intent="rename"
                icon="edit"
              />
            </Form>

            {seriesOf === null && (
              <Form method="post" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t.versionNumber} name="number" type="number" width="w-24" value="1" />
                  <Submit intent="cut-into-version" icon={<Icon name="copy" />}>{t.cut}</Submit>
                </div>
                <Empty>{t.cutNote(slug)}</Empty>
              </Form>
            )}
          </Section>

          {/* **The article is deleted one language at a time.** There is no
              article apart from what it says, so taking away the last thing it
              says takes it away — a separate control for the whole would be a
              second way to reach the same end, and the one that leaves nothing
              behind is the one a reader can see the effect of. */}
          <LocaleEditors
            editors={editors}
            locale={locale}
            lastWarning={t.removeLastDocumentWarning}
          />
        </Stack>
      </Card>
    </Page>
  )
}
