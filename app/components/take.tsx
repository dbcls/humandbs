/**
 * The take-in face: the draft and a source, place by place, with the value
 * that will be written under them (docs/editing.md の「取り込み」).
 *
 * **The two readings are read-only and the third is not.** What goes in is
 * often neither — a curator rewrites a title the application states awkwardly —
 * so a control that only chose between the two would leave nowhere to write.
 * The third is written with the control the form uses for that field, marks
 * for 未確定・該当なし included.
 *
 * **The face knows nothing of where the source came from, nor of what is being
 * written.** It is handed two values of one shape (`take.ts` の `TakeShape`)
 * and what that shape calls its places and draws its fields with, so a
 * version, another draft and an application — and a research and a dataset —
 * are one face.
 *
 * **Only the places that differ stand here.** A version bump changes a few
 * fields, and a face of every field would bury them.
 */

import { useId, useMemo, useState, type ReactNode } from "react"
import { Form } from "react-router"

import { describeInput, type ShownLine } from "~/admin/changes"
import type { DraftInput, LinksPairInput, TextInput, TextPairInput } from "~/admin/form"
import { readAt, writeAt } from "~/admin/paths"
import type { ResearchDatasetRow } from "~/admin/queries.server"
import type { DatasetRowView } from "~/public/view.server"
import {
  heldIds,
  initialTake,
  isList,
  listRows,
  RESEARCH_TAKE,
  takePlaces,
  withElement,
  type ListRow,
  type TakeShape,
} from "~/admin/take"
import type { TakeSource, TakeSourceRow } from "~/admin/take.server"
import { adminResearchPath } from "~/admin/urls"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { minuteInJst } from "~/dates"
import { href, researchPath } from "~/public/urls"

import { Button, ButtonLink, Chevron, Note, PANE_LABEL, Stack, Stated } from "./base"
import { Flag } from "./flags"
import { type Marks, PairField, SingleField } from "./fields"
import { CONTROL, Submit } from "./form"
import { Icon } from "./icons"
import { CompareTable, lineRows } from "./previous"
import { Empty, ExternalLink, Section, Table, Td } from "./page"
import { CitableTable, GrantIds, IdList, LinksField, PROSE_PATHS, researchFieldLabel } from "./research-fields"

/** What one kind of form brings to the face. */
export interface TakeParts<T> {
  shape: TakeShape<T>
  /** What the form calls the place a path names. */
  labelOf: (path: string) => string
  /** What one element of a list is, in a line. */
  nameOf: (path: string, element: unknown) => string
  /** The value that will be written at a path, drawn with the form's own control. */
  written: (
    path: string,
    value: unknown,
    onChange: (next: unknown) => void,
    /** The other paths the place holds (`TakeShape` の `along`), read and written together with it. */
    along: { read: (path: string) => unknown, write: (path: string, next: unknown) => void },
  ) => ReactNode
  /** One side's reading, where the default (`describeInput`) would show identities rather than names. */
  reading?: (side: T, path: string) => ShownLine[] | null
  /** The terms a reading names, as words. */
  termLabel?: (id: string) => string
  /** What the form posts as `content`. */
  posted: (written: T) => unknown
}

export function marksAt(path: string): Marks {
  return { at: path, changed: false, onTake: null }
}

function isTextInput(value: unknown): value is TextInput {
  return typeof value === "object" && value !== null && "state" in value && "text" in value
}

function isPair(value: unknown): value is { ja: unknown, en: unknown } {
  return typeof value === "object" && value !== null && "ja" in value && "en" in value
}

function isLinksPair(value: unknown): value is LinksPairInput {
  return isPair(value) && typeof value.ja === "object" && value.ja !== null && "links" in value.ja
}

/** The lists of a research whose elements hold fields of their own. */
const RESEARCH_LISTS = ["listingSummary.dataProviders", "dataProviders", "researchProjects", "grants", "relatedPublications"]

/** What an element of a research's list is called: its name, or its title. */
function elementName(element: unknown): string {
  if (typeof element !== "object" || element === null) return ""
  const record = element as Record<string, unknown>
  return writtenName(record.name ?? record.title)
}

/** A name or a title, in whichever language is written. */
export function writtenName(named: unknown): string {
  if (isTextInput(named)) return named.text
  if (isPair(named) && isTextInput(named.ja) && isTextInput(named.en)) {
    return named.ja.text.trim() !== "" ? named.ja.text : named.en.text
  }
  return ""
}

/** One side's reading at a path. A bare string (a date) reads as itself. */
function readingAt<T>(shape: TakeShape<T>, side: T, path: string): ShownLine[] | null {
  const found = readAt(side, shape.keysOf(path))
  if (!found.found) return null
  if (typeof found.value === "string") return [{ label: "", state: "value", text: found.value }]
  return describeInput(found.value)
}

export function sourceName(source: TakeSource, locale: Locale, minute: (at: string) => string): string {
  const t = messagesFor(locale).admin.take
  switch (source.kind) {
    case "version": return t.fromVersion(source.number)
    // An update is called by the version it updates, as its row in the table is.
    case "draft": return source.updating === null ? t.fromDraft(minute(source.updatedAt)) : t.fromUpdate(source.updating)
    case "application": return t.fromApplication(source.applicationId)
  }
}

/**
 * The face itself. `hidden` rides along with the post (the application to
 * record), `after` stands under the places (the datasets an application
 * registered), and either counts as something to take even where no place
 * differs.
 */
export function TakeFace<T>({ locale, parts, mine, theirs, sourceLabel, revision, hidden, before, after }: {
  locale: Locale
  parts: TakeParts<T>
  mine: T
  theirs: T
  sourceLabel: string
  /** Null for a dataset entry this draft has not written yet. */
  revision: number | null
  hidden?: ReactNode
  before?: ReactNode
  after?: ReactNode
}) {
  const t = messagesFor(locale).admin.take
  const { shape } = parts
  const opened = useMemo(() => initialTake(shape, mine, theirs), [shape, mine, theirs])
  const [written, setWritten] = useState(opened)
  const places = useMemo(() => takePlaces(shape, mine, theirs), [shape, mine, theirs])
  const offers = places.length > 0 || after !== undefined
  const read = (side: T, path: string) => parts.reading?.(side, path) ?? readingAt(shape, side, path)

  return (
    <Form method="post">
      <input type="hidden" name="revision" value={revision ?? ""} />
      <input type="hidden" name="content" value={JSON.stringify(parts.posted(written))} />
      {hidden}
      <Stack gap="block">
        {before}
        {!offers && <Empty>{t.same}</Empty>}

        {places.map((path) => {
          if (isList(shape, mine, theirs, path)) {
            const rows = listRows(shape, mine, theirs, path)
            return (
              <ListPlace
                key={path}
                locale={locale}
                title={parts.labelOf(path)}
                rows={rows}
                nameOf={(element) => parts.nameOf(path, element)}
                held={heldIds(shape, written, path)}
                sourceLabel={sourceLabel}
                onTick={(id, on) => {
                  setWritten((now) => withElement(shape, now, opened, rows, path, id, on))
                }}
              />
            )
          }
          // A place inside an element the written value no longer keeps has
          // nothing to be written into.
          const held = readAt(written, shape.keysOf(path))
          if (!held.found) return null
          return (
            <Section key={path} title={parts.labelOf(path)}>
              <Stack gap="tight">
                {/* **The two readings are the comparison the "変更あり" panel
                    draws** (`previous.tsx` の `CompareTable`): a sentence to a
                    line, the ones that differ tinted — side by side as plain
                    text, the one changed sentence in a long paragraph had to be
                    found by eye. */}
                <CompareTable
                  locale={locale}
                  against={t.current}
                  after={sourceLabel}
                  rows={lineRows(read(mine, path) ?? [], read(theirs, path) ?? [], parts.termLabel)}
                />
                {parts.written(
                  path,
                  held.value,
                  (next) => { setWritten((now) => writeAt(now, shape.keysOf(path), next) as T) },
                  {
                    read: (other) => readAt(written, shape.keysOf(other)).value,
                    write: (other, next) => { setWritten((now) => writeAt(now, shape.keysOf(other), next) as T) },
                  },
                )}
              </Stack>
            </Section>
          )
        })}

        {after}

        {offers && <div><Submit variant="primary" icon={<Icon name="download" />}>{t.apply}</Submit></div>}
      </Stack>
    </Form>
  )
}

/**
 * A list, in the same three steps as a field: the two sides compared, then
 * what the written value keeps.
 *
 * **The two sides read as the fields' do** (`CompareTable`), an element to a
 * line by its name — one only the draft has is struck out on the left, one
 * only the source has added on the right, and one both have stands untinted.
 * A table of ticks said the same with a blank cell for "not there" and a box
 * nobody had named. **What the written value keeps is a list of boxes named
 * for what they do**, each saying where the element is now; a change inside
 * an element both have is a place of its own, under the element's name.
 */
function ListPlace({ locale, title, rows, nameOf, held, sourceLabel, onTick }: {
  locale: Locale
  title: string
  rows: ListRow[]
  nameOf: (element: unknown) => string
  held: string[]
  sourceLabel: string
  onTick: (id: string, on: boolean) => void
}) {
  const t = messagesFor(locale).admin.take
  const keptId = useId()
  const side = (present: boolean, element: unknown) => present ? { state: "value" as const, text: nameOf(element) } : null
  return (
    <Section title={title}>
      <Stack gap="tight">
        <CompareTable
          locale={locale}
          against={t.current}
          after={sourceLabel}
          rows={rows.map((row) => ({ label: "", before: side(row.inMine, row.element), after: side(row.inTheirs, row.element) }))}
        />
        <div role="group" aria-labelledby={keptId}>
          <Stack gap="tight">
            <span id={keptId} className={PANE_LABEL}>{t.kept}</span>
            {rows.map((row) => (
              <label key={row.id} className="flex items-start gap-2 text-sm">
                <span className="flex h-[1lh] items-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand"
                    checked={held.includes(row.id)}
                    onChange={(event) => { onTick(row.id, event.target.checked) }}
                  />
                </span>
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span>{nameOf(row.element)}</span>
                  <span className="text-ink-muted text-xs">
                    {row.inMine && row.inTheirs ? t.inBoth : row.inMine ? t.onlyCurrent : t.onlySource}
                  </span>
                </span>
              </label>
            ))}
          </Stack>
        </div>
      </Stack>
    </Section>
  )
}

/** A date, written as the dataset's own screen writes it. */
export function DateField({ label, value, onChange }: { label: string, value: string, onChange: (next: string) => void }) {
  return (
    <Stack gap="tight">
      <span className={PANE_LABEL}>{label}</span>
      <input
        type="date"
        aria-label={label}
        className={`${CONTROL} w-48 text-sm`}
        value={value}
        onChange={(event) => { onChange(event.target.value) }}
      />
    </Stack>
  )
}

/** The research's parts: its places, its lists, and the form's controls. */
export function researchParts(
  locale: Locale,
  datasets: ResearchDatasetRow[],
  citable: DatasetRowView[],
  sides: readonly DraftInput[],
): TakeParts<DraftInput> {
  const messages = messagesFor(locale)
  const t = messages.admin.take
  const editor = messages.admin.editor
  const labelOf = new Map(datasets.map((row) => [row.id, row.label ?? editor.unpinnedDataset]))
  return {
    shape: RESEARCH_TAKE,
    // **A field inside an element says which element**: two providers' names
    // differing would otherwise stand as two places called the same.
    labelOf: (path) => {
      const label = researchFieldLabel(path, locale) ?? path
      const list = RESEARCH_LISTS.find((one) => path.startsWith(`${one}.`))
      const id = list === undefined ? undefined : path.slice(list.length + 1).split(".")[0]
      if (list === undefined || id === undefined || path === `${list}.${id}`) return label
      const element = sides
        .map((side) => readAt(side, RESEARCH_TAKE.keysOf(`${list}.${id}`)))
        .find((found) => found.found)?.value
      const name = elementName(element)
      return `${researchFieldLabel(list, locale) ?? list} ${name}: ${label}`
    },
    nameOf: (_path, element) => elementName(element),
    posted: (written) => written.content,
    // **A publication's datasets read as the page reads them**: the research's
    // own by their labels, then the typed IDs — never the identities.
    reading: (side, path) => {
      if (!path.endsWith(".datasetIds")) return null
      const chosen = readAt(side, RESEARCH_TAKE.keysOf(path))
      const typed = readAt(side, RESEARCH_TAKE.keysOf(path.replace(/datasetIds$/, "externalIds")))
      const ids = [
        ...(Array.isArray(chosen.value) ? chosen.value : []).map((id) => labelOf.get(String(id)) ?? String(id)),
        ...(Array.isArray(typed.value) ? typed.value.map(String) : []),
      ]
      return ids.map((text) => ({ label: "", state: "value", text }))
    },
    written: (path, value, onChange, along) => {
      const marks = marksAt(path)
      if (Array.isArray(value)) {
        const strings = value.filter((one): one is string => typeof one === "string")
        if (!path.endsWith("datasetIds")) {
          return <GrantIds label={t.written} locale={locale} value={strings} marks={marks} onChange={onChange} />
        }
        // The same two controls the form writes the place with, the typed
        // list moving with the chosen one (`RESEARCH_TAKE` の `along`).
        const typedPath = path.replace(/datasetIds$/, "externalIds")
        const typed = along.read(typedPath)
        return (
          <Stack gap="tight">
            <span className={PANE_LABEL}>{t.written}</span>
            <CitableTable locale={locale} datasets={citable} selected={strings} onChange={onChange} />
            <IdList
              label={editor.externalIds}
              itemLabel={editor.externalIds}
              addLabel={editor.addExternalId}
              hint={editor.externalIdsHint}
              locale={locale}
              value={Array.isArray(typed) ? typed.filter((one): one is string => typeof one === "string") : []}
              marks={marks}
              onChange={(next) => { along.write(typedPath, next) }}
            />
          </Stack>
        )
      }
      if (isLinksPair(value)) {
        return <LinksField label={t.written} value={value} marks={marks} locale={locale} onChange={onChange} />
      }
      if (isPair(value)) {
        return (
          <PairField
            label={t.written}
            value={value as TextPairInput}
            multiline={PROSE_PATHS.includes(path)}
            marks={marks}
            locale={locale}
            onChange={onChange}
          />
        )
      }
      if (isTextInput(value)) {
        return <SingleField label={t.written} value={value} marks={marks} locale={locale} onChange={onChange} />
      }
      return null
    },
  }
}

/**
 * What an application brings besides the draft's own fields: the warning that
 * its research ID is not this draft's, and the datasets it registered.
 */
export function ApplicationWarning({ locale, source, humLabel }: {
  locale: Locale
  source: Extract<TakeSource, { kind: "application" }>
  humLabel: string | null
}) {
  const t = messagesFor(locale).admin.templates
  // **Nothing here stops the take-in.** The branch's own research ID
  // disagreeing with the draft's is stated rather than refused — a version
  // bump can be approved under a corrected ID before the ledger catches up
  // (docs/editing.md の「行き先」).
  if (source.branch.humLabel === null || humLabel === null || source.branch.humLabel === humLabel) return null
  return <Note kind="warning">{t.humDiffers(source.branch.humLabel, humLabel)}</Note>
}

/**
 * The datasets a branch registered, each to be created in this research. One
 * another research already holds cannot be, and the way to that research
 * stands beside it.
 */
export function ApplicationDatasets({ locale, source }: {
  locale: Locale
  source: Extract<TakeSource, { kind: "application" }>
}) {
  const t = messagesFor(locale).admin.templates
  const datasets = source.choice.datasets
  return (
    <Section title={t.registered}>
      {datasets.length === 0
        ? <Empty>{t.noDatasets}</Empty>
        : (
            <ul className="flex flex-col gap-2 text-sm">
              {datasets.map((entry) => (
                <li key={entry.accession} className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name="accession"
                      value={entry.accession}
                      defaultChecked={entry.heldBy === null}
                      disabled={entry.heldBy !== null}
                    />
                    {entry.accession}
                  </label>
                  {entry.description !== "" && <span className="text-ink-muted">{entry.description}</span>}
                  {/* **Why it cannot be ticked is said before the way to where
                      it is** — the way alone reads as an invitation, and the
                      research it leads to may be this one. */}
                  {entry.heldBy !== null && (
                    <>
                      <span className="text-ink-muted text-xs">{t.taken}</span>
                      <ButtonLink to={href(locale, adminResearchPath(entry.heldBy))} size="row">
                        {t.openHolder}
                        <Chevron dir="right" />
                      </ButtonLink>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
    </Section>
  )
}

/**
 * The versions and drafts a value can be taken from, **in one table, the rows
 * the research's own screen draws**: as a source there is nothing to tell them
 * apart by, and one row drawn two ways would read as two things. So a draft
 * that updates a version is not a row of its own but that version's row, the
 * way the research's screen shows it (`TakeSourceRow`).
 */
export function SourceTable({ rows, here, current, humLabel, locale }: {
  rows: TakeSourceRow[]
  /** The take-in screen's own address, which a row adds its source to. */
  here: string
  /** The draft being written: the row that is it cannot be chosen. */
  current: string
  humLabel: string | null
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const detail = messages.admin.detail
  return (
    <Table
      align="middle"
      headers={[
        detail.kind,
        detail.version,
        detail.updatedAt,
        detail.releaseDate,
        <span key="actions" className="sr-only">{messages.admin.actions}</span>,
      ]}
      whenEmpty={messages.admin.take.noRows}
    >
      {rows.map((row) => (
        <SourceRow
          key={row.kind === "draft" ? row.id : row.number}
          row={row}
          to={href(locale, here) + queryOf(row)}
          humLabel={humLabel}
          self={row.kind === "draft" ? row.id === current : row.update?.id === current}
          locale={locale}
        />
      ))}
    </Table>
  )
}

/**
 * What choosing a row takes: a draft, a version — or, for a version being
 * updated, what the update has written, which is what the row's time and the
 * research's screen say the row is.
 */
function queryOf(row: TakeSourceRow): string {
  if (row.kind === "draft") return `?draft=${row.id}`
  if (row.update !== null) return `?draft=${row.update.id}`
  return `?version=${row.number}`
}

/**
 * A version or a draft, as the research's own screen draws it — what it is,
 * its number, when it was written and when it went out — with the one thing
 * done here, choosing it.
 */
function SourceRow({ row, to, humLabel, self, locale }: {
  row: TakeSourceRow
  to: string
  humLabel: string | null
  /**
   * This row is the draft being written — its own row, or the row of the
   * version it updates. **It stays in the table and says why it cannot be
   * chosen**: taking a draft into itself offers back what is already there,
   * and without the row the table would not say which one is being written.
   */
  self: boolean
  locale: Locale
}) {
  const messages = messagesFor(locale)
  const detail = messages.admin.detail
  const name = row.kind === "version" ? `v${row.number}` : null
  const updatedAt = row.kind === "version" && row.update !== null ? row.update.updatedAt : row.updatedAt
  return (
    <tr>
      <Td nowrap>
        {row.kind === "draft"
          ? (
              <span className="flex items-center gap-2 text-nowrap">
                <Stated icon="edit">{detail.draft}</Stated>
                {self && <Flag kind="pointed">{messages.admin.take.thisDraft}</Flag>}
              </span>
            )
          : (
              <span className="flex items-center gap-2 text-nowrap">
                <Stated icon="eye">{detail.published}</Stated>
                {row.update !== null && <Flag kind="changed">{detail.updating}</Flag>}
              </span>
            )}
      </Td>
      <Td nowrap>
        {name !== null && (humLabel === null
          ? <span>{name}</span>
          : <ExternalLink to={href(locale, `${researchPath(humLabel)}/${name}`)} locale={locale}>{name}</ExternalLink>)}
      </Td>
      <Td nowrap>{minuteInJst(updatedAt)}</Td>
      <Td nowrap>{row.kind === "version" ? row.releaseDate : ""}</Td>
      <Td nowrap holds="control">
        {self
          ? (
              <Button
                size="row"
                variant="secondary"
                icon={<Icon name="download" />}
                disabled={row.kind === "draft"
                  ? messages.admin.take.selfSource
                  : messages.admin.take.updatingSource(`v${row.number}`)}
              >
                {messages.admin.take.choose}
              </Button>
            )
          : <ButtonLink to={to} size="row" icon={<Icon name="download" />}>{messages.admin.take.choose}</ButtonLink>}
      </Td>
    </tr>
  )
}
