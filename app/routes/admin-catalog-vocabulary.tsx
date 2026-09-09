import { Form, Link } from "react-router"

import { catalogAction, vocabularyPage, type TermRow } from "~/admin/catalog.server"
import { adminCatalogPath, adminVocabularyPath } from "~/admin/urls"
import { Badge, Button, Fold, Stack } from "~/components/base"
import { Field, Result, Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, PageLinks, Section } from "~/components/page"
import { SearchBox } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-catalog-vocabulary"

/**
 * One vocabulary and its terms.
 *
 * **Every term is editable.** ICD10 arrives as a dictionary that seeds and
 * checks the terms rather than as a vocabulary of its own, so there is no set
 * whose values an import would overwrite (docs/data-model.md の「ICD10」).
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
        <Stack gap="block">
          {actionData !== undefined && (
            <Result ok={actionData.status === "ok"}>
              {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
            </Result>
          )}

          <p className="flex flex-wrap items-baseline gap-3 text-sm">
            <code>{set.code}</code>
            {set.hierarchical && <Badge>{t.hierarchical}</Badge>}
            <span className="text-ink-muted">{t.termCount(set.terms)}</span>
          </p>

          <SearchBox
            action={href(locale, adminVocabularyPath(set.code))}
            name="find"
            value={view.find}
            label={t.find}
            placeholder={t.find}
            submit={t.find}
          />

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

          {view.dictionary !== null && (
            <Section title={t.dictionary}>
              <p className="text-ink-muted text-sm">{t.dictionaryNote}</p>
              <SearchBox
                action={href(locale, adminVocabularyPath(set.code))}
                name="dictionary"
                value={view.dictionary.find}
                label={t.dictionaryFind}
                placeholder={t.dictionaryFind}
                submit={t.dictionaryFind}
              >
                {view.find !== "" && <input type="hidden" name="find" value={view.find} />}
              </SearchBox>
              {view.dictionary.find !== "" && view.dictionary.rows.length === 0 && (
                <Empty>{t.dictionaryEmpty}</Empty>
              )}
              <ul className="flex flex-col divide-y divide-line">
                {view.dictionary.rows.map((row) => (
                  <li key={row.code} className="py-2">
                    <Form method="post" className="flex flex-wrap items-baseline gap-2 text-sm">
                      <input type="hidden" name="intent" value="create-term" />
                      <input type="hidden" name="setId" value={set.id} />
                      <input type="hidden" name="code" value={row.code} />
                      <input type="hidden" name="labelEn" value={row.titleEn ?? row.titleJa ?? row.code} />
                      <input type="hidden" name="labelJa" value={row.titleJa ?? ""} />
                      <code className="w-24 shrink-0">{row.code}</code>
                      <span className="flex-1 min-w-0 break-words">
                        {row.titleEn ?? "—"}
                        {row.titleJa !== null && ` / ${row.titleJa}`}
                      </span>
                      {row.held
                        ? <Badge>{t.dictionaryHeld}</Badge>
                        : <Submit>{t.addTerm}</Submit>}
                    </Form>
                  </li>
                ))}
              </ul>
            </Section>
          )}

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
        </Stack>
      </Card>
    </Page>
  )
}

function Term({ term, locale }: { term: TermRow, locale: "ja" | "en" }) {
  const t = messagesFor(locale).admin.catalog
  const note = [
    term.used === 0 ? t.unused : t.used(term.used),
    term.parentCode === null ? undefined : `${t.parent}: ${term.parentCode}`,
  ].filter((part): part is string => part !== undefined).join(" · ")

  return (
    <li>
      <Fold
        summary={(
          <>
            <code className="text-ink-muted text-xs">{term.code}</code>
            {`${term.labelEn} / ${term.labelJa ?? "—"}`}
          </>
        )}
        note={(
          <>
            {note}
            {!term.active && <Badge>{t.inactive}</Badge>}
          </>
        )}
      >
        <Form method="post" className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="termId" value={term.id} />
          <Field label={t.labelEn} name="labelEn" value={term.labelEn} />
          <Field label={t.labelJa} name="labelJa" value={term.labelJa ?? ""} />
          <Button size="xs" name="intent" value="update-term">{t.save}</Button>
          <input type="hidden" name="active" value={term.active ? "false" : "true"} />
          <Button size="xs" name="intent" value="set-term-active">
            {term.active ? t.deactivate : t.activate}
          </Button>
          {term.used === 0 && <Button size="xs" name="intent" value="delete-term">{t.remove}</Button>}
        </Form>
      </Fold>
    </li>
  )
}
