import { Form, Link } from "react-router"

import { SETTLED_VOCABULARIES } from "~/admin/catalog"
import { catalogAction, catalogPage, type CatalogKeyRow } from "~/admin/catalog.server"
import { adminExperimentFieldPath } from "~/admin/urls"
import { Button, Confirm, Fold, Heading, Stack } from "~/components/base"
import { Checkbox, Field, Result, Select, Submit } from "~/components/form"
import { Card, Empty, Page, Section } from "~/components/page"
import { catalogLabel } from "~/i18n/catalog-label"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import type { Route } from "./+types/admin-experiment-fields"

/**
 * The fields an analysis method is described under.
 *
 * **The type of a field is shown and not editable.** A field typed as a
 * vocabulary or a number is what a refinement is made of, and a refinement
 * needs an aggregation, an input control and a decision about how the existing
 * prose becomes terms — so typing one is a development change, while adding,
 * renaming, reordering and removing free-text fields is administration
 * (docs/data-model.md の「catalog と語彙」).
 *
 * **What a dataset is described under is not here.** Access type and type of
 * data hold what the portal is rather than what the data brings, and the
 * glossary already fixes their words.
 *
 * **The vocabularies are not a list beside the fields.** Each belongs to
 * exactly one field, so it is reached by opening that field — which is what
 * lets its screen be titled with what the terms are the terms *of*.
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

export default function AdminExperimentFields({ loaderData, actionData }: Route.ComponentProps) {
  const view = loaderData
  const locale = view.locale
  const messages = messagesFor(locale)
  const t = messages.admin.catalog
  // A group drawn without a heading still has to be pickable here, and its code
  // is the only name it has.
  const categories = view.categories.map((category) => ({
    id: category.id,
    label: catalogLabel({ ...category, labelEn: category.labelEn ?? category.code }, locale),
  }))

  return (
    <Page>
      <Card under={false}>
        <Stack gap="block">
          <Heading title={t.heading} />
          {actionData !== undefined && (
            <Result ok={actionData.status === "ok"}>
              {actionData.status === "ok" ? t.done : t.problems[actionData.status]}
            </Result>
          )}
          <p className="text-ink-muted text-sm">{t.note}</p>

          {view.keys.length === 0
            ? <Empty>{t.noKey}</Empty>
            : (
                <ul className="flex flex-col divide-y divide-line border-line border-y">
                  {view.keys.map((key) => (
                    <FieldRow key={key.id} entry={key} categories={categories} locale={locale} />
                  ))}
                </ul>
              )}

          <Section title={t.addKey}>
            <Form method="post" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="intent" value="create-key" />
              <Field label={t.code} name="code" />
              <Field label={t.labelJa} name="labelJa" />
              <Field label={t.labelEn} name="labelEn" />
              <Checkbox label={t.showOnPublicPage} name="showOnPublicPage" checked />
              <Submit>{t.addKey}</Submit>
            </Form>
          </Section>
        </Stack>
      </Card>
    </Page>
  )
}

function FieldRow({ entry, categories, locale }: {
  entry: CatalogKeyRow
  categories: { id: string, label: string }[]
  locale: "ja" | "en"
}) {
  const t = messagesFor(locale).admin.catalog
  const typed = entry.valueType !== "text"
  const settled = entry.vocabularySetCode !== null
    && SETTLED_VOCABULARIES.has(entry.vocabularySetCode)
  const category = categories.find((one) => one.id === entry.categoryId)
  const note = [
    entry.canonicalUnit === null ? t.types[entry.valueType] : `${t.types[entry.valueType]} (${entry.canonicalUnit})`,
    category?.label,
    entry.terms === null ? undefined : t.termCount(entry.terms),
  ].filter((part): part is string => part !== undefined).join(" · ")

  return (
    // The row and its move buttons stand side by side rather than one inside
    // the other: a `<details>` toggles on any click inside it, including one on
    // the reorder buttons, so they need to sit outside the fold to be pressed
    // without also closing it — and to stay reachable while the row is closed.
    <li className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Fold
          summary={(
            <>
              <code className="text-ink-muted text-xs">{entry.code}</code>
              {`${entry.labelJa} / ${entry.labelEn}`}
            </>
          )}
          note={note}
        >
          <Form method="post" className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="keyId" value={entry.id} />
            <Field label={t.labelJa} name="labelJa" value={entry.labelJa} />
            <Field label={t.labelEn} name="labelEn" value={entry.labelEn} />
            <Select
              label={t.category}
              name="categoryId"
              value={entry.categoryId ?? ""}
              options={[
                { value: "", label: t.noCategory },
                ...categories.map((one) => ({ value: one.id, label: one.label })),
              ]}
            />
            <Checkbox
              label={t.showOnPublicPage}
              name="showOnPublicPage"
              checked={entry.showOnPublicPage}
            />
            <Button size="xs" name="intent" value="update-key">{t.save}</Button>
          </Form>
          {/* What the field draws from, when it draws from anything. A settled
              vocabulary has no screen: what it may hold is fixed by what the
              portal is, so the row says so rather than offering a way in. */}
          {entry.terms !== null && (settled
            ? <Empty>{t.settledNote}</Empty>
            : (
                <p className="text-sm">
                  <Link to={href(locale, adminExperimentFieldPath(entry.code))}>
                    {t.openTerms}
                  </Link>
                </p>
              ))}
          {/* A typed field is a refinement; taking one away is a development
              change too. Its own form: an intent written as a hidden field
              cannot share one with the buttons that name their own. */}
          {!typed && (
            <Form method="post" className="pt-2">
              <input type="hidden" name="keyId" value={entry.id} />
              <Confirm
                label={t.remove}
                warning={t.removeWarning}
                confirm={t.removeConfirm}
                cancel={t.cancel}
              >
                <input type="hidden" name="intent" value="delete-key" />
              </Confirm>
            </Form>
          )}
        </Fold>
      </div>
      <Form method="post" className="flex shrink-0 gap-1 pt-1.5">
        <input type="hidden" name="keyId" value={entry.id} />
        <Button size="xs" name="intent" value="move-key-up">{t.up}</Button>
        <Button size="xs" name="intent" value="move-key-down">{t.down}</Button>
      </Form>
    </li>
  )
}
