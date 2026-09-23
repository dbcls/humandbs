import { Form, Link } from "react-router"

import { nextVersionNumber } from "~/admin/contents"
import { seriesAction, seriesPage } from "~/admin/contents.server"
import { adminContentsPath, adminDocumentPath } from "~/admin/urls"
import { AdminBack } from "~/components/admin"
import { Badge, Confirm, Heading, Stack } from "~/components/base"
import { ResultLine, StateCell } from "~/components/contents"
import { Answered, Field, Result, Select, Submit } from "~/components/form"
import { Icon } from "~/components/icons"
import { Card, Code, Page, Section, Table, Td } from "~/components/page"
import { messagesFor } from "~/i18n/messages"
import { pageTitle } from "~/i18n/title"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents-series"

/**
 * One versioned article: the address readers hold, which revision it answers
 * with, and the revisions under it.
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
          {/* **What takes the whole series away stands beside its name**, next
              to the way back, the way an article's or an announcement's does
              (`admin-contents-news-item.tsx`): it acts on the series rather
              than on any one revision, so it belongs with what names the
              series rather than under the revisions. */}
          <Heading title={t.seriesHeading} aside={series.slug}>
            <AdminBack
              to={href(locale, adminContentsPath())}
              label={t.backToList}
              icon="chevron-left"
            />
            <Form method="post">
              <Confirm
                label={t.removeSeries}
                title={t.removeSeriesTitle(series.slug)}
                warning={t.removeSeriesWarning(series.revisions.length)}
                confirm={t.removeSeriesConfirm}
                cancel={t.cancel}
                intent="delete-series"
              />
            </Form>
          </Heading>

          {unanswered.length > 0 && (
            <Result ok={false}>
              {t.unanswered(series.slug, unanswered.map((each) => t.languages[each]).join(" / "))}
            </Result>
          )}

          {/*
            **What the screen is about comes first**: the address readers hold
            and which revision it answers with. The name of the part says what
            the address is called everywhere on this side, and the sentence
            under it says the one thing a curator cannot work out from the
            controls — that publishing does not move it.
          */}
          <Section title={t.representative} note={t.representativeNote(series.slug)}>
            {series.revisions.length > 0 && (
              <Form method="post" className="flex flex-wrap items-end gap-2">
                <Select
                  label={t.pointed}
                  name="documentId"
                  value={series.currentId}
                  width="w-96"
                  options={series.revisions.map((revision) => ({
                    value: revision.id,
                    label: revision.slug,
                  }))}
                />
                <Submit intent="repoint-series" icon={<Icon name="link" />}>{t.repoint}</Submit>
              </Form>
            )}
          </Section>

          {/*
            **Which revision the address answers with is a mark in the listing
            rather than a line above it.** The listing is where the reader is
            choosing one anyway, and said in both places the two drift apart the
            moment the pointer is moved.

            **No count over the rows.** Every revision is on screen, and a number
            over ten visible rows says what the rows already say.
          */}
          <Section title={t.revisionList}>
            <Table
              headers={[t.slug, t.title, t.languages.ja, t.languages.en]}
              whenEmpty={t.noRevision}
            >
              {series.revisions.map((revision) => (
                <tr key={revision.id}>
                  <Td nowrap>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link to={href(locale, adminDocumentPath(revision.id))}>
                        <Code>{revision.slug}</Code>
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
        </Stack>
      </Card>
    </Page>
  )
}
