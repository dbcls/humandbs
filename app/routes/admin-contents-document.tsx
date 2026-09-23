import { useState } from "react"
import { Form } from "react-router"

import { documentAction, documentPage } from "~/admin/contents.server"
import { adminContentsPath, adminSeriesPath } from "~/admin/urls"
import { Confirm, Stack } from "~/components/base"
import { ResultLine, SlugEditor, useArticlePanes } from "~/components/contents"
import { DraftHead } from "~/components/draft-tools"
import { Answered, Field, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Empty, Page, Section } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-document"

/**
 * One document: its slug, and each language's body and published state, with
 * the page each body makes drawn beside the form (`components/contents.tsx` の
 * `useArticlePanes`).
 *
 * **The slug can be corrected but doing so moves the page.** External
 * references — submission metadata, other bodies, the navigation constants —
 * are not rewritten by anything, so the panel says as much rather than
 * refusing (`components/contents.tsx` の `SlugEditor`).
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

/** What is in the version-number box, so the sentence under it can say where the body goes. */
function numberIn(form: HTMLFormElement): string {
  const field = form.elements.namedItem("number")
  return field instanceof HTMLInputElement ? field.value.trim() : ""
}

export default function AdminContentsDocument({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, id, slug, seriesOf, editors } = loaderData
  const t = messagesFor(locale).admin.contents
  const [number, setNumber] = useState("1")

  const panes = useArticlePanes({ locale, remember: `document:${id}`, editors, result: actionData })

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Stack>
        {/* **The head is left for the article; the tools row is what stays
            while typing** (`draft-tools.tsx` の `DraftHead`/`DraftTools`, the
            same two steps a research draft takes). Between the two, the
            head's second line reaches version control — a document without
            revisions has nowhere else that operation belongs. */}
        <DraftHead
          locale={locale}
          title={t.documentHeading}
          aside={slug}
          updating={null}
          back={{
            to: href(locale, seriesOf === null ? adminContentsPath() : adminSeriesPath(seriesOf.id)),
            label: seriesOf === null ? t.backToList : t.backToSeries,
            icon: "chevron-left",
          }}
          headExtra={(
            <>
              {/* **The slug is changed from beside the name that shows it.** It
                  is the one thing the article has apart from what it says, and
                  it already stands at the name's side as the identifier; a part
                  of the page for it would hold nothing but this one control. */}
              <Form method="post">
                <SlugEditor locale={locale} intent="rename" name="slug" value={slug} hint={t.slugHint} />
              </Form>
              {/* **What takes the whole article away stands beside its name**,
                  next to the way back, rather than among the languages
                  (`admin-contents-news-item.tsx`). **The revision a series points
                  at has no such control**: the version-less address has to keep
                  answering, and the way to take it down is the series' own
                  screen, which takes the pointer with it. */}
              {seriesOf?.isCurrent !== true && (
                <Form method="post">
                  <Confirm
                    label={t.removeDocument}
                    title={t.removeDocumentTitle(slug)}
                    warning={t.removeDocumentWarning}
                    confirm={t.removeDocumentConfirm}
                    cancel={t.cancel}
                    intent="delete-document"
                  />
                </Form>
              )}
            </>
          )}
          overview={seriesOf === null && (
            /* **Only an article without revisions has this part.** Moving an
               article under version control is done to the article, not to a
               language's words, so it does not go among the languages'
               forms. The sentence under the name says what this article is
               not yet, and the one under the box says the address the body
               goes to with the number as typed, rather than a placeholder
               for it. */
            <Section title={t.versioning} note={t.versioningNote}>
              <Form
                method="post"
                className="flex flex-col gap-2"
                onInput={(event) => { setNumber(numberIn(event.currentTarget)) }}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t.versionNumber} name="number" type="number" width="w-24" value="1" />
                  <Submit intent="cut-into-version" icon={<Icon name="copy" />}>{t.cut}</Submit>
                </div>
                <Empty>{t.cutNote(slug, number === "" ? t.versionNumber : number)}</Empty>
              </Form>
            </Section>
          )}
        />
        {panes.tools}
        {panes.view}
      </Stack>
    </Page>
  )
}
