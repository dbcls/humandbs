import { Form, Link } from "react-router"

import { catalogAction, catalogPage, type CatalogKeyRow } from "~/admin/catalog.server"
import { adminVocabularyPath } from "~/admin/urls"
import { Badge } from "~/components/base"
import { Field, Result, Submit } from "~/components/form"
import { Card, Empty, Page, PageHead, Section } from "~/components/page"
import { catalogLabel } from "~/i18n/catalog-label"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-catalog"

/**
 * The catalog: the keys a value can be stored under, the vocabularies those
 * values are drawn from, and how the facets are grouped.
 *
 * **The type of a key is shown and not editable.** A key typed as a vocabulary
 * or a number is a facet, and a facet needs an aggregation, an input control and
 * a decision about how the existing prose becomes terms — so typing one is a
 * development change, while adding, renaming, reordering and removing free-text
 * keys is administration (docs/data-model.md の「catalog と語彙」).
 */
export async function loader({ request }: Route.LoaderArgs) {
  return catalogPage(request)
}

export async function action({ request }: Route.ActionArgs) {
  return catalogAction(request)
}

export function meta({ loaderData }: Route.MetaArgs) {
  const messages = messagesFor(loaderData.locale)
  return [
    { title: `${messages.admin.catalog.heading} - ${messages.siteName}` },
    { name: "robots", content: "noindex" },
  ]
}

export default function AdminCatalog({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  // A category drawn without a heading still has to be pickable here, and its
  // code is the only name it has.
  const categories = view.categories.map((category) => ({
    id: category.id,
    label: catalogLabel({ ...category, labelEn: category.labelEn ?? category.code }, locale),
  }))

  return (
    <Page>
      <PageHead label={t.heading} />
      <Card>
        {actionData !== undefined && (
          <Result ok={actionData.status === "ok"}>
            {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
          </Result>
        )}
        <p className="mb-4 text-ink-muted text-sm">{t.note}</p>

        {(["dataset", "experiment"] as const).map((scope) => (
          <Section
            key={scope}
            title={scope === "dataset" ? t.datasetKeys : t.experimentKeys}
          >
            <ul className="flex flex-col divide-y divide-line border-line border-y">
              {view.keys.filter((key) => key.scope === scope).map((key) => (
                <KeyRow key={key.id} entry={key} categories={categories} locale={locale} />
              ))}
            </ul>
          </Section>
        ))}

        <Section title={t.addKey}>
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="create-key" />
            <Field label={t.code} name="code" />
            <label className="flex flex-col text-sm">
              {t.scope}
              <select name="scope" className="rounded border border-line bg-surface-input px-2 py-1">
                <option value="experiment">{t.scopes.experiment}</option>
                <option value="dataset">{t.scopes.dataset}</option>
              </select>
            </label>
            <Field label={t.labelJa} name="labelJa" />
            <Field label={t.labelEn} name="labelEn" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="showOnPublicPage" defaultChecked />
              {t.showOnPublicPage}
            </label>
            <Submit>{t.addKey}</Submit>
          </Form>
        </Section>

        <Section title={t.vocabularies}>
          <ul className="flex flex-col divide-y divide-line border-line border-y">
            {view.vocabularies.map((set) => (
              <li key={set.id} className="flex flex-wrap items-baseline gap-3 py-2 text-sm">
                <code className="w-56 shrink-0">{set.code}</code>
                <span className="flex-1">{catalogLabel(set, locale)}</span>
                {set.hierarchical && <Badge>{t.hierarchical}</Badge>}
                <span className="text-ink-muted">{t.termCount(set.terms)}</span>
                <Link to={href(locale, adminVocabularyPath(set.code))}>{t.openSet}</Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.categories}>
          {view.categories.length === 0
            ? <Empty>{t.noCategory}</Empty>
            : (
                <ul className="flex flex-col divide-y divide-line border-line border-y">
                  {view.categories.map((category) => (
                    <li key={category.id} className="py-2">
                      <Form method="post" className="flex flex-wrap items-end gap-2 text-sm">
                        <input type="hidden" name="categoryId" value={category.id} />
                        <code className="w-40 shrink-0 self-center">{category.code}</code>
                        <Field label={t.labelJa} name="labelJa" value={category.labelJa ?? ""} />
                        <Field label={t.labelEn} name="labelEn" value={category.labelEn ?? ""} />
                        <Submit intent="update-category">{t.save}</Submit>
                        <Submit intent="move-category-up">{t.up}</Submit>
                        <Submit intent="move-category-down">{t.down}</Submit>
                        <Submit intent="delete-category">{t.remove}</Submit>
                      </Form>
                    </li>
                  ))}
                </ul>
              )}
          <Form method="post" className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="create-category" />
            <Field label={t.code} name="code" />
            <Field label={t.labelJa} name="labelJa" />
            <Field label={t.labelEn} name="labelEn" />
            <Submit>{t.addCategory}</Submit>
          </Form>
        </Section>
      </Card>
    </Page>
  )
}

function KeyRow({ entry, categories, locale }: {
  entry: CatalogKeyRow
  categories: { id: string, label: string }[]
  locale: "ja" | "en"
}) {
  const t = messagesFor(locale).admin.catalog
  const typed = entry.valueType !== "text"
  return (
    <li className="py-2">
      <Form method="post" className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="keyId" value={entry.id} />
        <code className="w-56 shrink-0 self-center break-all">{entry.code}</code>
        <span className="w-24 shrink-0 self-center text-ink-muted">
          {t.types[entry.valueType]}
          {entry.canonicalUnit !== null && ` (${entry.canonicalUnit})`}
        </span>
        <Field label={t.labelJa} name="labelJa" value={entry.labelJa} />
        <Field label={t.labelEn} name="labelEn" value={entry.labelEn} />
        <label className="flex flex-col">
          {t.category}
          <select
            name="categoryId"
            defaultValue={entry.categoryId ?? ""}
            className="rounded border border-line bg-surface-input px-2 py-1"
          >
            <option value="">{t.noCategory}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 self-center">
          <input
            type="checkbox"
            name="showOnPublicPage"
            defaultChecked={entry.showOnPublicPage}
          />
          {t.showOnPublicPage}
        </label>
        <Submit intent="update-key">{t.save}</Submit>
        <Submit intent="move-key-up">{t.up}</Submit>
        <Submit intent="move-key-down">{t.down}</Submit>
        {/* A typed key is a facet; taking one away is a development change too. */}
        {!typed && <Submit intent="delete-key">{t.remove}</Submit>}
      </Form>
    </li>
  )
}
