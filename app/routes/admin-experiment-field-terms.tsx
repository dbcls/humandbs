import { Form } from "react-router"

import { catalogAction, fieldTermsPage, type TermRow } from "~/admin/catalog.server"
import { adminExperimentFieldPath, adminExperimentFieldsPath } from "~/admin/urls"
import { AdminCrumbs } from "~/components/admin"
import { Badge, Button, Confirm, Fold, Stack } from "~/components/base"
import { Field, Result, Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, Paging, Section } from "~/components/page"
import { SearchBox } from "~/components/search"
import { catalogLabel } from "~/i18n/catalog-label"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-experiment-field-terms"

/**
 * The terms one field draws its values from.
 *
 * **The screen is named after the field, not after the vocabulary.** Every
 * vocabulary belongs to exactly one field, so a screen called 「語彙」 could
 * only ever be answered with "which vocabulary?" — while 「プラットフォームで
 * 選べる語」 says both what is here and what it is for (`admin/urls.ts`).
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
  const view = await fieldTermsPage(request, params.key)
  if (view === null) throw new Response(null, { status: 404, statusText: "Not Found" })
  return view
}

export async function action({ request }: Route.ActionArgs) {
  return catalogAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  const title = messages.admin.catalog.termsOf(catalogLabel(loaderData.field, loaderData.locale))
  return [
    { title: `${title} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminFieldTerms({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  const set = view.set
  const here = adminExperimentFieldPath(view.field.code)
  const title = t.termsOf(catalogLabel(view.field, locale))

  return (
    <Page>
      <AdminCrumbs
        locale={locale}
        trail={[{ label: t.heading, to: href(locale, adminExperimentFieldsPath()) }]}
        current={title}
      />
      <PageHead label={title} />
      <Card>
        <Stack gap="block">
          {actionData !== undefined && (
            <Result ok={actionData.status === "ok"}>
              {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
            </Result>
          )}

          {set.hierarchical && (
            <p className="text-sm"><Badge>{t.hierarchical}</Badge></p>
          )}

          <SearchBox
            action={href(locale, here)}
            name="find"
            value={view.find}
            label={t.find}
            placeholder={t.find}
            submit={t.find}
            searchAsTyped
          />

          {view.terms.length === 0
            ? <Empty>{view.find === "" ? t.noTerm : t.noMatchingTerm}</Empty>
            : (
                <ul className="flex flex-col divide-y divide-line border-line border-y">
                  {view.terms.map((term) => (
                    <Term key={term.id} term={term} locale={locale} />
                  ))}
                </ul>
              )}
          <div className="flex justify-end">
            <Paging
              locale={locale}
              total={set.terms}
              from={view.rangeFrom}
              to={view.rangeTo}
              page={view.page}
              pageCount={view.pageCount}
              at={(to) => href(
                locale,
                `${here}?${new URLSearchParams({
                  ...(view.find === "" ? {} : { find: view.find }),
                  page: String(to),
                }).toString()}`,
              )}
            />
          </div>

          {view.dictionary !== null && (
            <Section title={t.dictionary}>
              <p className="text-ink-muted text-sm">{t.dictionaryNote}</p>
              <SearchBox
                action={href(locale, here)}
                name="dictionary"
                value={view.dictionary.find}
                label={t.dictionaryFind}
                placeholder={t.dictionaryFind}
                submit={t.dictionaryFind}
                searchAsTyped
              >
                {view.find !== "" && <input type="hidden" name="find" value={view.find} />}
              </SearchBox>
              {view.dictionary.find !== "" && view.dictionary.rows.length === 0 && (
                <Empty>{t.dictionaryEmpty}</Empty>
              )}
              <ul className="flex flex-col divide-y divide-line">
                {view.dictionary.rows.map((row) => (
                  <li key={row.code} className="py-2">
                    <Form method="post" className="flex flex-wrap items-center gap-2 text-sm">
                      <input type="hidden" name="intent" value="create-term" />
                      <input type="hidden" name="setId" value={set.id} />
                      <input type="hidden" name="code" value={row.code} />
                      <input type="hidden" name="labelEn" value={row.titleEn ?? row.titleJa ?? row.code} />
                      <input type="hidden" name="labelJa" value={row.titleJa ?? ""} />
                      <code className="w-24 shrink-0">{row.code}</code>
                      <span className="min-w-0 flex-1 break-words">
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
        </Form>
        {/* Nothing names this term, so it can go — and going is what cannot be
            undone, unlike deactivating it. */}
        {term.used === 0 && (
          <Form method="post">
            <input type="hidden" name="termId" value={term.id} />
            <Confirm
              label={t.remove}
              warning={t.removeWarning}
              confirm={t.removeConfirm}
              cancel={t.cancel}
            >
              <input type="hidden" name="intent" value="delete-term" />
            </Confirm>
          </Form>
        )}
      </Fold>
    </li>
  )
}
