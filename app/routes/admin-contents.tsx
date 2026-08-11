import { Form, Link } from "react-router"

import type { TreeEntry } from "~/admin/contents"
import { contentsAction, contentsPage, type AlertRow } from "~/admin/contents.server"
import { adminContentFilesPath, adminDocumentPath, adminNewsListPath } from "~/admin/urls"
import { ResultLine, StateBadges } from "~/components/contents"
import { Badge, Field, Result, Submit, TextArea } from "~/components/form"
import { Card, Empty, Page, PageHead, Section } from "~/components/page"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-contents"

/**
 * Site content: the pages, the pointer each guideline's version-less address
 * holds, and the banner.
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
  const { locale, tree, unanswered, alerts } = loaderData
  const t = messagesFor(locale).admin.contents

  return (
    <Page>
      <PageHead label={t.heading}>
        <Link to={href(locale, adminNewsListPath())} className="text-white">{t.news.heading}</Link>
        <Link to={href(locale, adminContentFilesPath())} className="text-white">{t.files.heading}</Link>
      </PageHead>
      <Card>
        <ResultLine result={actionData} locale={locale} />
        <p className="mb-4 text-ink-muted text-sm">{t.note}</p>

        {unanswered.map((one) => (
          <Result key={one.slug} ok={false}>
            {t.unanswered(one.slug, one.locales.map((each) => t.languages[each]).join(" / "))}
          </Result>
        ))}

        <Section title={t.documents}>
          <ul className="flex flex-col divide-y divide-line border-line border-y">
            {tree.map((entry) => (
              <Entry
                key={entry.kind === "series" ? entry.series.id : entry.document.id}
                entry={entry}
                locale={locale}
              />
            ))}
          </ul>
        </Section>

        <Section title={t.addDocument}>
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="create-document" />
            <Field label={t.slug} name="slug" width="w-96" />
            <Submit>{t.addDocument}</Submit>
          </Form>
        </Section>

        <Section title={t.alerts}>
          {alerts.length === 0
            ? <Empty>{t.noAlert}</Empty>
            : alerts.map((row) => <AlertForm key={row.id} row={row} locale={locale} />)}
          <Form method="post" className="mt-3">
            <Submit intent="create-alert">{t.addAlert}</Submit>
          </Form>
        </Section>
      </Card>
    </Page>
  )
}

function Entry({ entry, locale }: { entry: TreeEntry, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  const indent = INDENT[Math.min(entry.depth, INDENT.length - 1)] ?? ""

  if (entry.kind === "document") {
    return (
      <li className={`flex flex-wrap items-baseline gap-3 py-2 text-sm ${indent}`}>
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
      <div className="flex flex-wrap items-baseline gap-3">
        <code className="w-96 shrink-0">{series.slug}</code>
        <Badge>{t.seriesBadge}</Badge>
        <span className="flex-1">{current === null ? t.noCurrent : current.title}</span>
        {current !== null && <StateBadges states={current.states} locale={locale} />}
      </div>

      <Form method="post" className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="seriesId" value={series.id} />
        <label className="flex items-center gap-1">
          {t.current}
          <select
            name="documentId"
            defaultValue={series.currentId}
            className="rounded border border-line bg-surface-input px-2 py-1"
          >
            {series.revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>{revision.slug}</option>
            ))}
          </select>
        </label>
        <Submit intent="repoint-series">{t.repoint}</Submit>
        <Submit intent="add-version">{t.addVersion}</Submit>
        <Submit intent="flatten-series">{t.flatten}</Submit>
      </Form>

      <details className="mt-2">
        <summary className="cursor-pointer text-ink-muted">{t.revisions(series.revisions.length)}</summary>
        <ul className="mt-1 flex flex-col divide-y divide-line border-line border-y">
          {series.revisions.map((revision) => (
            <li key={revision.id} className="flex flex-wrap items-baseline gap-3 py-2 pl-6">
              <Link to={href(locale, adminDocumentPath(revision.id))} className="w-96 shrink-0">
                <code>{revision.slug}</code>
              </Link>
              <span className="flex-1">{revision.title}</span>
              {revision.id === series.currentId && <Badge>{t.isCurrent}</Badge>}
              <StateBadges states={revision.states} locale={locale} />
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function AlertForm({ row, locale }: { row: AlertRow, locale: Locale }) {
  const t = messagesFor(locale).admin.contents
  return (
    <Form method="post" className="mb-4 flex flex-col gap-2 border-line border-b pb-4">
      <input type="hidden" name="alertId" value={row.id} />
      <TextArea label={t.languages.ja} name="ja" value={row.ja} rows={2} />
      <TextArea label={t.languages.en} name="en" value={row.en} rows={2} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="active" defaultChecked={row.active} />
          {t.alertActive}
        </label>
        <Submit intent="update-alert">{t.save}</Submit>
        <Submit intent="delete-alert">{t.remove}</Submit>
      </div>
    </Form>
  )
}
