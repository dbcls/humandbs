import { Form, Link } from "react-router"

import { nextVersionNumber, type TreeEntry } from "~/admin/contents"
import { contentsAction, contentsPage } from "~/admin/contents.server"
import { adminAlertPath, adminContentFilesPath, adminDocumentPath, adminNewsListPath } from "~/admin/urls"
import { ResultLine, StateBadges } from "~/components/contents"
import { Badge, Confirm, Fold, Heading, Stack } from "~/components/base"
import { Field, Result, Select, Submit } from "~/components/form"
import { Card, Empty, Page, Section } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents"

/**
 * The articles: the bodies readers hold addresses for, and the pointer each
 * guideline's version-less address carries.
 *
 * **The listing is a tree drawn from the slugs.** Nothing stores a parent — a
 * slug with a path in it is below the slug it extends, and the revisions of a
 * guideline hang off the pointer rather than beside it, so nine revisions are
 * one row until they are opened.
 *
 * **A version-less address whose current revision is not published in some
 * language is reported at the top.** That address is baked into submission
 * metadata held elsewhere and has to keep answering, and the pointer is the one
 * way it can stop (docs/editing.md の「サイトコンテンツ」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  return contentsPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return contentsAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.contents.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

const INDENT = ["", "pl-6", "pl-12", "pl-16"]

export default function AdminContents({ loaderData, actionData }: Route.ComponentProps) {
  const { locale, tree, unanswered } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} note={t.note}>
            <Link to={href(locale, adminAlertPath())}>{t.alert.heading}</Link>
            <Link to={href(locale, adminNewsListPath())}>{t.news.heading}</Link>
            <Link to={href(locale, adminContentFilesPath())}>{t.files.heading}</Link>
          </Heading>
          <ResultLine result={actionData} locale={locale} />

          {unanswered.map((one) => (
            <Result key={one.slug} ok={false}>
              {t.unanswered(one.slug, one.locales.map((each) => t.languages[each]).join(" / "))}
            </Result>
          ))}

          {/*
            The tree stands under the h1 without a section of its own: the
            screen holds one kind of thing, and a heading repeating the name of
            the screen says nothing the h1 has not.
          */}
          {tree.length === 0 && <Empty>{t.noDocument}</Empty>}
          <ul className="flex flex-col divide-y divide-line border-line border-y">
            {tree.map((entry) => (
              <Entry
                key={entry.kind === "series" ? entry.series.id : entry.document.id}
                entry={entry}
                locale={locale}
              />
            ))}
          </ul>

          <Section title={t.addDocument}>
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="create-document" />
              <Field label={t.slug} name="slug" width="w-96" />
              <Submit>{t.addDocument}</Submit>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}

function Entry({ entry, locale }: { entry: TreeEntry, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  const indent = INDENT[Math.min(entry.depth, INDENT.length - 1)] ?? ""

  if (entry.kind === "document") {
    return (
      <li className={`flex flex-wrap items-center gap-3 py-2 text-sm ${indent}`}>
        <Link to={href(locale, adminDocumentPath(entry.document.id))} className="w-96 shrink-0">
          <code>{entry.document.slug}</code>
        </Link>
        <span className="flex-1">{entry.document.title}</span>
        <StateBadges states={entry.document.states} locale={locale} />
      </li>
    )
  }

  const { series, current } = entry
  return (
    <li className={`py-2 text-sm ${indent}`}>
      <Stack gap="tight">
        <div className="flex flex-wrap items-center gap-3">
          <code className="w-96 shrink-0">{series.slug}</code>
          <Badge>{t.seriesBadge}</Badge>
          <span className="flex-1">{current === null ? t.noCurrent : current.title}</span>
          {current !== null && <StateBadges states={current.states} locale={locale} />}
        </div>

        <Form method="post" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="seriesId" value={series.id} />
          <Select
            label={t.current}
            name="documentId"
            value={series.currentId}
            options={series.revisions.map((revision) => ({ value: revision.id, label: revision.slug }))}
          />
          <Submit intent="repoint-series">{t.repoint}</Submit>
        </Form>

        <Form method="post" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="seriesId" value={series.id} />
          <Field
            label={t.versionNumber}
            name="number"
            type="number"
            width="w-24"
            value={String(nextVersionNumber(series.slug, series.revisions.map((one) => one.slug)))}
          />
          <Submit intent="add-version">{t.addVersion}</Submit>
        </Form>

        <Form method="post">
          <Confirm
            label={t.removeSeries}
            warning={t.removeSeriesNote(series.revisions.length)}
            confirm={t.removeSeriesConfirm}
            cancel={t.cancel}
          >
            <input type="hidden" name="intent" value="delete-series" />
            <input type="hidden" name="seriesId" value={series.id} />
          </Confirm>
        </Form>

        <Fold summary={t.revisions(series.revisions.length)}>
          <ul className="flex flex-col divide-y divide-line border-line border-y">
            {series.revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-center gap-3 py-2 pl-6">
                <Link to={href(locale, adminDocumentPath(revision.id))} className="w-96 shrink-0">
                  <code>{revision.slug}</code>
                </Link>
                <span className="flex-1">{revision.title}</span>
                {revision.id === series.currentId && <Badge>{t.isCurrent}</Badge>}
                <StateBadges states={revision.states} locale={locale} />
              </li>
            ))}
          </ul>
        </Fold>
      </Stack>
    </li>
  )
}
