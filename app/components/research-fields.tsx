/**
 * The fields a research's content has and a dataset's does not: links, grant
 * numbers, the datasets a publication cites — and what each place in the
 * content is called.
 *
 * **Two screens write these**: the research's own form and the import form,
 * which writes the one value it is deciding with the same control the form
 * uses. A second copy would be a second place for the two to drift apart.
 */

import type { LinkInput, LinksPairInput } from "~/admin/form"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import type { SeededField } from "~/admin/templates.server"
import type { DatasetRowView } from "~/public/view.server"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"

import { Button, IconButton, Stack } from "./base"
import { FieldHead, LanguageLabel, type FieldAnnotations, newId, StateSwitch } from "./fields"
import { CONTROL } from "./form"
import { Icon } from "./icons"
import { Empty, Table, Td } from "./page"
import { DatasetCells, datasetColumns } from "./research"

/**
 * What the form calls the place a path names — a repeating section's own name
 * for the list itself, and for a field inside one, the name the form gives that
 * field. Undefined for a path the form does not draw.
 */
export function researchFieldLabel(path: string, locale: Locale): string | undefined {
  const messages = messagesFor(locale)
  const words = messages.research
  const t = messages.admin.editor
  const [head, ...rest] = path.split(".")
  const tail = rest.join(".")
  switch (head) {
    case "title": return words.title
    case "releaseNote": return words.releaseNote
    case "summary":
      if (tail === "aims") return words.aims
      if (tail === "methods") return words.methods
      if (tail === "targets") return words.targets
      if (tail === "url") return words.url
      return words.overview
    case "dataProviders":
      if (tail.endsWith("organization.name")) return words.organization
      if (tail.endsWith(".name")) return words.principalInvestigator
      return words.dataProvider
    case "researchProjects":
      if (tail.endsWith(".name")) return words.researchProjectName
      if (tail.endsWith(".url")) return words.url
      return words.researchProjects
    case "grants":
      if (tail.endsWith(".title")) return words.grantTitle
      if (tail.endsWith("agency.name")) return words.grantAgency
      if (tail.endsWith("grantIds")) return t.grantIds
      return words.grants
    case "relatedPublications":
      if (tail.endsWith(".title")) return words.publicationTitle
      if (tail.endsWith(".doi")) return t.doi
      if (tail.endsWith("datasetIds")) return messagesFor(locale).dataset.datasetId
      return words.relatedPublications
    case "listingSummary":
      if (tail === "methods") return words.listingSummary.methods
      if (tail === "targets") return words.listingSummary.targets
      if (tail === "typeOfData") return words.listingSummary.typeOfData
      if (tail === "dataProviders" || tail.endsWith(".name")) return words.listingSummary.dataProviders
      return t.paneRow
    default:
      return undefined
  }
}

/**
 * Where each thing an application states goes in the research, so that its
 * screens name it as the research's own form does (`researchFieldLabel`).
 */
export const SEEDED_PATH: Record<SeededField, string> = {
  title: "title",
  aims: "summary.aims",
  methods: "summary.methods",
  targets: "summary.targets",
  provider: "dataProviders",
}

/** The fields whose boxes run to several lines, as the form draws them. */
export const PROSE_PATHS: readonly string[] = [
  "releaseNote",
  "summary.aims",
  "summary.methods",
  "summary.targets",
  "listingSummary.methods",
  "listingSummary.targets",
  "listingSummary.typeOfData",
]

/**
 * A URL pair. The two languages are different resources rather than two
 * renderings of one, so nothing here is ever untranslated.
 *
 * **The two languages stand one above the other, as every pair does**: side
 * by side, each link's address and text had half a panel's width between them
 * and the pair
 * read as two columns of a table rather than as one value written twice.
 */
export function LinksField({ label, value, annotations, locale, onChange }: {
  label?: string
  value: LinksPairInput
  annotations: FieldAnnotations
  locale: Locale
  onChange: (next: LinksPairInput) => void
}) {
  const t = messagesFor(locale).admin.editor

  return (
    <Stack gap="tight" at={annotations.at}>
      <FieldHead label={label} annotations={annotations} locale={locale} />
      <div className="flex flex-col gap-2">
        {(["ja", "en"] as const).map((language) => {
          const side = value[language]
          const setLinks = (links: LinkInput[]) => {
            onChange({ ...value, [language]: { ...side, links } })
          }
          return (
            <Stack key={language} gap="tight">
              <div className="flex items-center justify-between gap-2">
                <LanguageLabel language={language} />
                <StateSwitch
                  state={side.state}
                  onChange={(state) => { onChange({ ...value, [language]: { ...side, state } }) }}
                  locale={locale}
                />
              </div>
              {side.links.map((link, at) => (
                <div key={link.id} className="flex flex-wrap items-center gap-1">
                  <input
                    type="text"
                    aria-label={t.url}
                    placeholder={t.url}
                    className={`${CONTROL} min-w-40 flex-1 text-sm`}
                    disabled={side.state !== "value"}
                    value={link.url}
                    onChange={(event) => {
                      setLinks(side.links.map((row, index) =>
                        index === at ? { ...row, url: event.target.value } : row))
                    }}
                  />
                  <input
                    type="text"
                    aria-label={t.linkText}
                    placeholder={t.linkText}
                    className={`${CONTROL} min-w-32 flex-1 text-sm`}
                    disabled={side.state !== "value"}
                    value={link.text}
                    onChange={(event) => {
                      setLinks(side.links.map((row, index) =>
                        index === at ? { ...row, text: event.target.value } : row))
                    }}
                  />
                  <IconButton
                    name="trash"
                    label={t.remove}
                    onClick={() => { setLinks(side.links.filter((_, index) => index !== at)) }}
                  />
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  icon={<Icon name="plus" aria-hidden="true" />}
                  disabled={side.state !== "value"}
                  onClick={() => { setLinks([...side.links, { id: newId(), url: "", text: "" }]) }}
                >
                  {t.addLink}
                </Button>
              </div>
            </Stack>
          )
        })}
      </div>
    </Stack>
  )
}

/**
 * The numbers a grant is known by.
 *
 * They are plain strings with no identity of their own, so a row is addressed by
 * its position — which is also why the whole list is one path to the diff and
 * has one indicator rather than one per number.
 */
export function GrantIds({ label, locale, value, annotations, onChange }: {
  label?: string
  locale: Locale
  value: string[]
  annotations: FieldAnnotations
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor
  return (
    <IdList
      label={label ?? t.grantIds}
      itemLabel={t.grantIds}
      addLabel={t.addGrantId}
      locale={locale}
      value={value}
      annotations={annotations}
      onChange={onChange}
    />
  )
}

/**
 * A list of IDs typed one to a box: a grant's numbers, the datasets a
 * publication names beyond this research's own.
 *
 * **A box per ID, not one box of commas** — an ID is copied from somewhere else
 * one at a time, and a box holding one shows where it ends without a separator
 * to get wrong.
 */
export function IdList({ label, itemLabel, addLabel, hint, placeholder, locale, value, annotations, onChange }: {
  label?: string
  /** What each box is called for whoever reaches it by keyboard. */
  itemLabel: string
  addLabel: string
  /** What goes in the boxes and how, said under them. */
  hint?: string
  /** The shape of one ID, shown in an empty field. */
  placeholder?: string
  locale: Locale
  value: string[]
  annotations: FieldAnnotations
  onChange: (next: string[]) => void
}) {
  const t = messagesFor(locale).admin.editor

  return (
    <Stack gap="tight" at={annotations.at}>
      <FieldHead label={label} annotations={annotations} locale={locale} />
      <div className="md:max-w-md">
        <Stack gap="tight">
          {value.map((id, at) => (
            <div key={at} className="flex items-center gap-1">
              <input
                type="text"
                aria-label={itemLabel}
                placeholder={placeholder}
                className={`${CONTROL} flex-1 text-sm`}
                value={id}
                onChange={(event) => {
                  onChange(value.map((row, index) => index === at ? event.target.value : row))
                }}
              />
              <IconButton
                name="trash"
                label={t.remove}
                onClick={() => { onChange(value.filter((_, index) => index !== at)) }}
              />
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              icon={<Icon name="plus" aria-hidden="true" />}
              onClick={() => { onChange([...value, ""]) }}
            >
              {addLabel}
            </Button>
          </div>
        </Stack>
      </div>
      {hint !== undefined && <span className="text-ink-muted text-xs">{hint}</span>}
    </Stack>
  )
}

export function datasetName(row: ResearchDatasetRow, locale: Locale): string {
  return row.label ?? messagesFor(locale).admin.editor.unpinnedDataset
}

/**
 * This research's datasets a publication can name, as the public page's
 * dataset table draws them, with a box to tick at the front of each row.
 *
 * **The same columns as the page** (`research.tsx` の `DatasetCells`): a
 * curator choosing which datasets a paper used tells them apart by what they
 * hold and when they came out, and an ID alone shows neither. **The box in the
 * head takes all of them or none** — a paper often covers every dataset of
 * its research, and ticking twenty boxes one by one is where one gets missed.
 */
export function CitableTable({ locale, datasets, selected, onChange }: {
  locale: Locale
  datasets: DatasetRowView[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const messages = messagesFor(locale)
  if (datasets.length === 0) return <Empty>{messages.admin.editor.noDatasets}</Empty>

  const ids = datasets.map((row) => row.id ?? "")
  const chosen = ids.filter((id) => selected.includes(id)).length
  // What the table does not list stays chosen either way: the box represents
  // these rows and nothing else.
  const others = selected.filter((id) => !ids.includes(id))

  return (
    <Table
      align="middle"
      headers={[
        <input
          key="pick"
          type="checkbox"
          aria-label={messages.admin.editor.pickAll}
          checked={chosen === ids.length}
          // Some but not all: the box shows it rather than claiming either.
          ref={(box) => { if (box !== null) box.indeterminate = chosen > 0 && chosen < ids.length }}
          onChange={(event) => { onChange(event.target.checked ? [...others, ...ids] : others) }}
        />,
        ...datasetColumns(locale),
      ]}
    >
      {datasets.map((row) => {
        const id = row.id ?? ""
        const name = row.label === "" ? messages.admin.editor.unpinnedDataset : row.label
        return (
          <tr key={id}>
            <Td holds="icon">
              <input
                type="checkbox"
                aria-label={name}
                checked={selected.includes(id)}
                onChange={(event) => {
                  onChange(event.target.checked
                    ? [...selected, id]
                    : selected.filter((one) => one !== id))
                }}
              />
            </Td>
            <DatasetCells row={row} name={name} to={null} locale={locale} />
          </tr>
        )
      })}
    </Table>
  )
}
