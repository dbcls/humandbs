import { Form, Link } from "react-router"

import { catalogAction, vocabularyPage, type TermRow } from "~/admin/catalog.server"
import { adminCatalogPath, adminVocabularyPath } from "~/admin/urls"
import { Badge, Field, Result, Submit } from "~/components/form"
import { Card, Page, PageHead, PageLinks, Section } from "~/components/page"
import { catalogLabel } from "~/i18n/catalog-label"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-catalog-vocabulary"

/**
 * One vocabulary and its terms.
 *
 * **A term from an external standard is read-only.** The set is replaced
 * wholesale at the next import, so a correction made here would disappear
 * without leaving a trace of having been made (docs/data-model.md の
 * 「catalog と語彙」).
 *
 * **A term in use is deactivated rather than deleted.** Deactivating takes it
 * out of the input control while leaving it resolvable for the values that
 * already name it; deleting one that is still named would leave a value nobody
 * can render.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const view = await vocabularyPage(request, params.code)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request }: Route.ActionArgs) {
  return catalogAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${loaderData.set.code} - ${messages.admin.catalog.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminVocabulary({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const set = view.set

  return (
    <Page>
      <PageHead label={`${t.terms} - ${catalogLabel(set, locale)}`}>
        <Link to={href(locale, adminCatalogPath())} className="text-white">{t.heading}</Link>
      </PageHead>
      <Card>
        {actionData !== undefined && (
          <Result ok={actionData.status === "ok"}>
            {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
          </Result>
        )}

        <p className="mb-4 flex flex-wrap items-baseline gap-3 text-sm">
          <code>{set.code}</code>
          <Badge>{set.external ? t.external : t.portal}</Badge>
          {set.hierarchical && <Badge>{t.hierarchical}</Badge>}
          <span className="text-ink-muted">{t.termCount(set.terms)}</span>
        </p>
        {set.external && <p className="mb-4 text-ink-muted text-sm">{t.externalReadOnly}</p>}

        <form method="get" className="mb-4 flex gap-2">
          <input
            type="search"
            name="find"
            defaultValue={view.find}
            aria-label={t.find}
            placeholder={t.find}
            className="w-72 rounded border border-line bg-surface-input px-2 py-1 text-sm"
          />
          <Submit>{t.find}</Submit>
        </form>

        <ul className="flex flex-col divide-y divide-line border-line border-y">
          {view.terms.map((term) => (
            <Term key={term.id} term={term} locale={locale} />
          ))}
        </ul>
        <PageLinks
          label={messages.search.pagination}
          page={view.page}
          pageCount={view.pageCount}
          at={(to) => href(
            locale,
            `${adminVocabularyPath(set.code)}?${new URLSearchParams({
              ...(view.find === "" ? {} : { find: view.find }),
              page: String(to),
            }).toString()}`,
          )}
          previous={messages.search.previousPage}
          next={messages.search.nextPage}
        />

        {!set.external && (
          <Section title={t.addTerm}>
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="create-term" />
              <input type="hidden" name="setId" value={set.id} />
              <Field label={t.code} name="code" />
              <Field label={t.labelEn} name="labelEn" />
              <Field label={t.labelJa} name="labelJa" />
              <Submit>{t.addTerm}</Submit>
            </Form>
          </Section>
        )}
      </Card>
    </Page>
  )
}

function Term({ term, locale }: { term: TermRow, locale: "ja" | "en" }) {
  const t = messagesFor(locale).admin.catalog
  return (
    <li className="py-2">
      <Form method="post" className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="termId" value={term.id} />
        <code className="w-40 shrink-0 self-center break-all">{term.code}</code>
        {term.parentCode !== null && (
          <span className="self-center text-ink-muted text-xs">
            {t.parent}
            {": "}
            {term.parentCode}
          </span>
        )}
        {term.external
          ? (
              <span className="flex-1 self-center">
                {term.labelEn}
                {term.labelJa !== null && ` / ${term.labelJa}`}
              </span>
            )
          : (
              <>
                <Field label={t.labelEn} name="labelEn" value={term.labelEn} />
                <Field label={t.labelJa} name="labelJa" value={term.labelJa ?? ""} />
              </>
            )}
        <span className="self-center text-ink-muted">
          {term.used === 0 ? t.unused : t.used(term.used)}
        </span>
        {!term.active && <Badge>{t.inactive}</Badge>}
        {!term.external && (
          <>
            <Submit intent="update-term">{t.save}</Submit>
            <input type="hidden" name="active" value={term.active ? "false" : "true"} />
            <Submit intent="set-term-active">
              {term.active ? t.deactivate : t.activate}
            </Submit>
            {term.used === 0 && <Submit intent="delete-term">{t.remove}</Submit>}
          </>
        )}
      </Form>
    </li>
  )
}
