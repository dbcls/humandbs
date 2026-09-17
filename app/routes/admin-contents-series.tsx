import { Form, Link } from "react-router"

import { nextVersionNumber } from "~/admin/contents"
import { seriesAction, seriesPage } from "~/admin/contents.server"
import { adminContentsPath, adminDocumentPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Badge, Confirm, Heading, Stack } from "~/components/base"
import { ResultLine, StateCell } from "~/components/contents"
import { Answered, Field, Result, Select, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Counted, Page, Section, Table, Td } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-series"

/**
 * One versioned article: the revisions under it, and which of them its
 * version-less address answers with.
 *
 * **The pointer is moved by hand.** Publishing a revision does not move it — a
 * body is written and published over several sittings, and an address that
 * followed the newest published revision would change under readers halfway
 * through (docs/editing.md の「サイトコンテンツ」).
 *
 * **Retiring takes the pointer and every revision at once.** The revision the
 * pointer names cannot be deleted on its own, so one at a time would leave the
 * pointer standing last with nothing left to point at.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await seriesPage(request, params.seriesId)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request, params }: Route.ActionArgs) {
  return seriesAction(request, params.seriesId)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: pageTitle(messages, messages.admin.contents.seriesHeading, loaderData.series.slug) },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminContentsSeries({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, series, unanswered } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Answered answer={actionData} locale={locale}>
        <ResultLine result={actionData} locale={locale} />
      </Answered>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.seriesHeading} aside={series.slug}>
            <AdminBack
              to={href(locale, adminContentsPath())}
              label={t.backToList}
              icon="chevron-left"
            />
          </Heading>

          {unanswered.length > 0 && (
            <Result ok={false}>
              {t.unanswered(series.slug, unanswered.map((each) => t.languages[each]).join(" / "))}
            </Result>
          )}

          {/*
            **Which revision is current is a mark in the listing rather than a
            line above it.** The listing is where the reader is choosing one
            anyway, and said in both places the two drift apart the moment a
            pointer is moved.
          */}
          <Section title={t.revisions}>
            <Counted locale={locale} total={series.revisions.length} />
            <Table
              headers={[t.slug, t.title, t.languages.ja, t.languages.en]}
              whenEmpty={t.noRevision}
            >
              {series.revisions.map((revision) => (
                <tr key={revision.id}>
                  <Td nowrap>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link to={href(locale, adminDocumentPath(revision.id))}>
                        <code>{revision.slug}</code>
                      </Link>
                      {revision.id === series.currentId && <Badge>{t.isCurrent}</Badge>}
                    </span>
                  </Td>
                  <Td floor="min-w-64">{revision.title}</Td>
                  <Td nowrap><StateCell state={revision.states.ja} locale={locale} /></Td>
                  <Td nowrap><StateCell state={revision.states.en} locale={locale} /></Td>
                </tr>
              ))}
            </Table>

            <Form method="post" className="flex flex-wrap items-end gap-2">
              <Field
                label={t.versionNumber}
                name="number"
                type="number"
                width="w-24"
                value={String(nextVersionNumber(series.slug, series.revisions.map((one) => one.slug)))}
              />
              <Submit intent="add-version" icon={<Icon name="plus" />}>{t.addVersion}</Submit>
            </Form>
          </Section>

          <Section title={t.current} note={t.currentNote}>
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <Select
                label={t.versions}
                name="documentId"
                value={series.currentId}
                options={series.revisions.map((revision) => ({
                  value: revision.id,
                  label: revision.slug,
                }))}
              />
              <Submit intent="repoint-series" icon={<Icon name="link" />}>{t.repoint}</Submit>
            </Form>
          </Section>

          <Section title={t.removeHeading}>
            <Form method="post">
              <Confirm
                label={t.removeSeries}
                title={t.removeSeriesTitle(series.slug)}
                warning={t.removeSeriesNote(series.revisions.length)}
                confirm={t.removeSeriesConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-series" />
              </Confirm>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}
