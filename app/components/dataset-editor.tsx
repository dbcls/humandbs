/**
 * The screen one dataset of a draft is written on.
 *
 * The unit is the dataset because that is the unit of everything else about it:
 * its own identity, its own entry in the draft, its own revision to be checked
 * against. A research with two hundred datasets is not one screenful, and a
 * conflict over one of them is not a conflict over the rest.
 *
 * **Experiments are here rather than on a screen of their own.** They live
 * inside this dataset's content, so they are saved with it and checked against
 * the same revision.
 *
 * A value is shown under the catalog key it is stored against, and **only the
 * keys it actually has**. A slot that is not there is not an empty value: it is
 * the dataset not carrying that item at all, which is a different thing from
 * carrying it and leaving it blank. Adding one is choosing a key.
 *
 * **The three parts are tabs, and each experiment folds inside its own.** The
 * experiment scope of the catalog runs to some ninety keys, so one experiment
 * carrying a fair share of them is a couple of thousand pixels of boxes and a
 * handful of them is a page nothing can be found on. Only the display is
 * switched: every field stays in the document, one save carries the whole of
 * it, and a mark beside a field is addressed by path and so is unaffected by
 * which tab it is under. **The tab is not in the address** — nothing here saves
 * on its own, so a reload would cost what has been typed whatever tab it
 * restored.
 *
 * **What is marked is open.** An experiment a save refused, a publish moved or
 * the server rejected markup in is unfolded, and so is one with no display
 * label — a fold nobody can read the summary of is a listing that lies about
 * itself.
 */

import { useState, type ReactNode } from "react"
import { useFetcher } from "react-router"

import { diffDatasetInput, takeDatasetField } from "~/admin/dataset-diff"
import {
  datasetContentInput,
  emptyNumberRow,
  emptyValueInput,
  UneditableValueKind,
  type DatasetContentInput,
  type ExperimentInput,
  type NumberRow,
  type ValueInput,
  type ValueKind,
} from "~/admin/dataset-form"
import type { SlotState } from "~/admin/form"
import type { DatasetEditorView } from "~/admin/pages.server"
import type { EditableCatalog, EditableKey, EditableTerm } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftReviewPath,
  draftCommentsPath,
  draftPresencePath,
  draftUndoPath,
  termsPath,
} from "~/admin/urls"
import {
  Badge,
  Button,
  Fold,
  IconButton,
  Note,
  SectionTabs,
  Stack,
  TabPanel,
} from "~/components/base"
import { CONTROL } from "~/components/form"
import { Icon } from "~/components/icons"
import { Page } from "~/components/page"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"
import { threadsByPath } from "~/review/comments"

import { DraftBar, useDraftEditing, type DraftEditing } from "./draft-tools"
import { FieldReview, type FieldReviewData } from "./field-review"
import { FileSelection } from "./files"
import {
  AddElement,
  ConflictBand,
  ElementCard,
  FieldHead,
  PairField,
  ProblemBand,
  RowButton,
  Section,
  SingleField,
  StateSwitch,
  UpstreamBand,
  emptySlot,
  moved,
  newId,
  replacing,
  type Marks,
} from "./fields"

/**
 * How many candidates the term picker offers at once. A vocabulary can hold
 * thousands, and a list longer than this is not read — it is typed at again.
 */
const PICKER_RESULTS = 20

const BASICS = "basics"
const FILES = "files"
const EXPERIMENTS = "experiments"

export function DatasetEditor({ view }: { view: DatasetEditorView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.datasetEditor
  const editor = messagesFor(locale).admin.editor
  const { researchId, draftId } = view

  const subject = { kind: "dataset" as const, datasetId: view.datasetId }
  const termLabelOf = new Map(view.terms.map((term) => [term.id, catalogLabel(term, locale)]))
  // Declared above the editing state rather than below it: what a field hangs
  // beside itself is passed to the hook as a value at the call.
  const review: FieldReviewData = {
    context: {
      locale,
      action: href(locale, draftCommentsPath(researchId, draftId)),
      subject,
      canResolve: true,
      signedInName: view.review.signedInName,
    },
    threads: threadsByPath(view.review.threads, subject),
    changed: view.review.changed,
    previous: view.review.previous,
    heading: messagesFor(locale).preview.previousPublished,
    termLabel: (id) => termLabelOf.get(id) ?? id,
  }

  const editing = useDraftEditing<DatasetContentInput>({
    initial: view.input,
    revision: view.revision,
    upstream: view.upstream,
    diff: diffDatasetInput,
    take: takeDatasetField,
    body: (value) => ({ content: value }),
    // A snapshot holds the whole draft; this screen takes the part of it that
    // is this dataset. One taken before the draft had touched the dataset has
    // no part to take, which is worth saying rather than silently doing
    // nothing.
    fromSnapshot: (snapshot) => {
      const entry = snapshot.datasetEntries.find((row) => row.datasetId === view.datasetId)
      return entry === undefined ? null : datasetContentInput(entry.content)
    },
    undoPath: (undoId) => draftUndoPath(researchId, draftId, undoId),
    extraFor: (path) => <FieldReview review={review} at={path} />,
  })

  const [tab, setTab] = useState(BASICS)
  const input = editing.value
  const marked = markedPaths(editing)
  const markedUnder = (prefix: string) =>
    marked.filter((path) => path === prefix || path.startsWith(`${prefix}.`)).length

  function tabMark(count: number): ReactNode {
    if (count === 0) return undefined
    return (
      <Badge tone="accent">
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{t.markedItems(count)}</span>
      </Badge>
    )
  }

  /** What is worth knowing about an experiment while it is folded away. */
  function experimentNote(experiment: ExperimentInput): string {
    const count = t.valueCount(experiment.values.length)
    return markedUnder(`experiments.${experiment.id}`) > 0 ? `${count} · ${editor.changed}` : count
  }

  const tabs = [
    {
      id: BASICS,
      label: t.basics,
      mark: tabMark(markedUnder("releaseDate") + markedUnder("values")),
    },
    // Only a dataset the portal issued the id for. An archive's dataset is
    // distributed by the archive, so there is nothing here to choose from and a
    // selection on one is refused on save.
    ...(view.portalIssued
      ? [{ id: FILES, label: t.files, mark: tabMark(markedUnder("fileSelection")) }]
      : []),
    {
      id: EXPERIMENTS,
      label: t.experiments,
      mark: tabMark(markedUnder("experiments")),
    },
  ]

  return (
    <Page>
      <Stack>
        <DraftBar
          locale={locale}
          heading={view.datasetLabel ?? editor.unpinnedDataset}
          links={[
            { to: href(locale, adminDraftDatasetsPath(researchId, draftId)), label: t.backToList },
            { to: href(locale, adminDraftPath(researchId, draftId)), label: t.backToDraft },
            { to: href(locale, adminDraftReviewPath(researchId, draftId)), label: editor.review },
          ]}
          note={!view.published && (
            <span className="text-ink-muted text-xs">
              {messagesFor(locale).admin.detail.unpublishedDataset}
            </span>
          )}
          dirty={editing.dirty}
          saved={editing.saved}
          saving={editing.saving}
          onSave={editing.save}
          undo={view.undo}
          onUndo={editing.undo}
          undoLoading={editing.undoLoading}
          presencePath={draftPresencePath(researchId, draftId)}
          presence={view.presence}
        >
          <SectionTabs label={t.tabsLabel} tabs={tabs} current={tab} onSelect={setTab} />
        </DraftBar>

        {view.review.changed.length > 0 && (
          <Note kind="plain">{editor.differsCount(view.review.changed.length)}</Note>
        )}
        {editing.conflict !== null && (
          <ConflictBand locale={locale} changed={editing.conflict.changed} />
        )}
        {editing.upstream !== null
          && (editing.upstream.only.length > 0 || editing.upstream.both.length > 0) && (
          <UpstreamBand
            locale={locale}
            only={editing.upstream.only}
            both={editing.upstream.both}
            onTakeAll={editing.takeUpstream}
          />
        )}
        {editing.problems.length > 0 && (
          <ProblemBand locale={locale} problems={editing.problems} />
        )}
        {editing.undoMissing && <Note kind="plain">{t.undoWithoutEntry}</Note>}

        <TabPanel id={BASICS} current={tab}>
          <Section id={BASICS} title={t.basics}>
            <Stack gap="tight">
              <FieldHead
                label={t.releaseDate}
                marks={editing.marksFor("releaseDate")}
                locale={locale}
              />
              <p className="text-ink-muted text-xs">{t.releaseDateHint}</p>
              <div>
                <input
                  type="date"
                  className={`${CONTROL} text-sm`}
                  value={input.releaseDate}
                  onChange={(event) => {
                    editing.edit({ ...input, releaseDate: event.target.value })
                  }}
                />
              </div>
            </Stack>
            <Values
              locale={locale}
              catalog={view.catalog}
              terms={view.terms}
              scope="dataset"
              path="values"
              values={input.values}
              marksFor={editing.marksFor}
              onChange={(values) => { editing.edit({ ...input, values }) }}
            />
          </Section>
        </TabPanel>

        {view.portalIssued && (
          <TabPanel id={FILES} current={tab}>
            <Section id={FILES} title={t.files}>
              <FieldHead
                label={t.files}
                marks={editing.marksFor("fileSelection")}
                locale={locale}
              />
              <FileSelection
                locale={locale}
                listing={view.box}
                selected={input.fileSelection}
                onChange={(fileSelection) => { editing.edit({ ...input, fileSelection }) }}
              />
            </Section>
          </TabPanel>
        )}

        <TabPanel id={EXPERIMENTS} current={tab}>
          <Section id={EXPERIMENTS} title={t.experiments}>
            <FieldHead
              label={t.experiments}
              marks={editing.marksFor("experiments")}
              locale={locale}
            />
            {input.experiments.map((experiment, at) => (
              <ElementCard
                key={experiment.id}
                index={at}
                count={input.experiments.length}
                locale={locale}
                onMove={(by) => {
                  editing.edit({ ...input, experiments: moved(input.experiments, at, by) })
                }}
                onRemove={() => {
                  editing.edit({
                    ...input,
                    experiments: input.experiments.filter((row) => row.id !== experiment.id),
                  })
                }}
              >
                <Fold
                  summary={experiment.label.text === ""
                    ? t.unnamedExperiment
                    : experiment.label.text}
                  note={experimentNote(experiment)}
                  open={experiment.label.text === ""
                    || markedUnder(`experiments.${experiment.id}`) > 0}
                >
                  <Experiment
                    locale={locale}
                    catalog={view.catalog}
                    terms={view.terms}
                    experiment={experiment}
                    marksFor={editing.marksFor}
                    onChange={(next) => {
                      editing.edit({
                        ...input,
                        experiments: replacing(input.experiments, experiment.id, next),
                      })
                    }}
                  />
                </Fold>
              </ElementCard>
            ))}
            <AddElement
              label={t.addExperiment}
              onClick={() => {
                editing.edit({
                  ...input,
                  experiments: [
                    ...input.experiments,
                    { id: newId(), label: emptySlot(), values: [] },
                  ],
                })
              }}
            />
          </Section>
        </TabPanel>
      </Stack>
    </Page>
  )
}

/**
 * Every path a save or a publish left something at, whatever kind of thing it
 * left. A tab and a fold both hide what is inside them, so both have to be able
 * to say that something in there wants looking at — and none of the four
 * reasons is more worth saying than the others.
 */
function markedPaths(editing: DraftEditing<DatasetContentInput>): string[] {
  return [
    ...editing.conflict?.changed ?? [],
    ...editing.upstream?.only ?? [],
    ...editing.upstream?.both ?? [],
    ...editing.problems.map((problem) => problem.path),
  ]
}

function Experiment({ locale, catalog, terms, experiment, marksFor, onChange }: {
  locale: Locale
  catalog: EditableCatalog
  terms: EditableTerm[]
  experiment: ExperimentInput
  marksFor: (path: string) => Marks
  onChange: (next: ExperimentInput) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const path = `experiments.${experiment.id}`

  return (
    <Stack>
      <SingleField
        label={t.experimentLabel}
        value={experiment.label}
        marks={marksFor(`${path}.label`)}
        locale={locale}
        onChange={(label) => { onChange({ ...experiment, label }) }}
      />
      <Values
        locale={locale}
        catalog={catalog}
        terms={terms}
        scope="experiment"
        path={`${path}.values`}
        values={experiment.values}
        marksFor={marksFor}
        onChange={(values) => { onChange({ ...experiment, values }) }}
      />
    </Stack>
  )
}

/**
 * The values a dataset or an experiment carries, in catalog order, and the way
 * to add one it does not carry yet.
 *
 * **A key cannot be invented here.** Adding one is choosing from the catalog,
 * which is what keeps the set of keys a decision somebody made rather than a
 * side effect of typing — the way the previous portal's catalog drifted.
 */
function Values({ locale, catalog, terms, scope, path, values, marksFor, onChange }: {
  locale: Locale
  catalog: EditableCatalog
  /** The terms the document names, for the chosen values to be readable. */
  terms: EditableTerm[]
  scope: "dataset" | "experiment"
  path: string
  values: ValueInput[]
  marksFor: (path: string) => Marks
  onChange: (next: ValueInput[]) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const keys = catalog.keys.filter((key) => key.scope === scope)
  const keyById = new Map(keys.map((key) => [key.id, key]))
  const positionOf = (value: ValueInput) => keyById.get(value.keyId)?.position ?? 0
  const inOrder = [...values].sort((a, b) => positionOf(a) - positionOf(b))
  const held = new Set(values.map((value) => value.keyId))
  const spare = keys.filter((key) => !held.has(key.id) && isEditable(key))

  const replace = (keyId: string, next: ValueInput) => {
    onChange(values.map((value) => value.keyId === keyId ? next : value))
  }

  return (
    <Stack>
      <FieldHead label={t.values} marks={marksFor(path)} locale={locale} />
      {inOrder.map((value) => {
        const key = keyById.get(value.keyId)
        if (key === undefined) return null
        const at = `${path}.${value.keyId}`
        const body = value.value
        return (
          <Stack key={value.keyId} gap="tight">
            {body.kind === "text" && (
              <PairField
                label={catalogLabel(key, locale)}
                value={body.text}
                multiline
                marks={marksFor(at)}
                locale={locale}
                onChange={(text) => {
                  replace(value.keyId, { keyId: value.keyId, value: { kind: "text", text } })
                }}
              />
            )}
            {body.kind === "vocabulary" && (
              <VocabularyField
                label={catalogLabel(key, locale)}
                locale={locale}
                marks={marksFor(at)}
                setId={key.vocabularySetId}
                chosen={terms}
                multiple={key.multiple}
                state={body.state}
                termIds={body.termIds}
                onChange={(state, termIds) => {
                  replace(value.keyId, {
                    keyId: value.keyId,
                    value: { kind: "vocabulary", state, termIds },
                  })
                }}
              />
            )}
            {body.kind === "number" && (
              <NumberField
                label={catalogLabel(key, locale)}
                locale={locale}
                marks={marksFor(at)}
                units={key.inputUnits ?? []}
                state={body.state}
                rows={body.rows}
                onChange={(next) => {
                  replace(value.keyId, { keyId: value.keyId, value: { kind: "number", ...next } })
                }}
              />
            )}
            <div>
              <RowButton
                label={t.removeValue}
                onClick={() => { onChange(values.filter((row) => row.keyId !== value.keyId)) }}
              />
            </div>
          </Stack>
        )
      })}
      {spare.length > 0 && (
        <AddValue
          locale={locale}
          keys={spare}
          onAdd={(key) => {
            onChange([...values, emptyValueInput(key.id, editableKind(key), key.canonicalUnit)])
          }}
        />
      )}
    </Stack>
  )
}

/**
 * Whether the editor has an input control for a key, and which. Only the three
 * kinds the catalog uses are editable; a key of any other type arrives with the
 * layer that gives it a control, because **a value nobody can see is a value
 * nobody can keep**.
 *
 * The last case cannot be reached — only keys `isEditable` lets through get
 * here — and it throws rather than falling back so that a fourth kind gaining a
 * control is a change in one place rather than a slot quietly rendered as prose.
 */
function editableKind(key: EditableKey): ValueKind {
  switch (key.valueType) {
    case "text":
      return "text"
    case "vocabulary":
      return "vocabulary"
    case "number":
      return "number"
    default:
      throw new UneditableValueKind(key.id, key.valueType)
  }
}

function isEditable(key: EditableKey): boolean {
  return key.valueType === "text" || key.valueType === "vocabulary" || key.valueType === "number"
}

/**
 * The way to add an item the dataset or the experiment is not carrying:
 * folded away, filtered by what the key is called or by the code it is
 * stored under, and each candidate is the control that adds it.
 *
 * **The shape does not follow the number of keys on offer.** A dataset down to
 * a couple of spare items and an experiment down to most of ninety draw the
 * same control, so the catalog does not change the screen's shape on the day a
 * key is added to it — the same reason `VocabularyField` and `FileSelection`
 * draw this shape regardless of how many candidates they hold.
 *
 * **The filtering happens here rather than on the server.** Unlike a
 * vocabulary's terms, the keys on offer already came down with the document —
 * a dataset or an experiment only ever has as many catalog keys as the scope
 * defines, not a set that grows the way a vocabulary does.
 *
 * **Nothing is chosen and then confirmed** — a second press to commit a choice
 * already made is a step that only exists because the first control could not
 * act.
 */
function AddValue({ locale, keys, onAdd }: {
  locale: Locale
  keys: EditableKey[]
  onAdd: (key: EditableKey) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const [find, setFind] = useState("")

  const needle = find.trim().toLowerCase()
  const offered = keys.filter((key) =>
    catalogLabel(key, locale).toLowerCase().includes(needle)
    || key.code.toLowerCase().includes(needle))

  return (
    <Fold summary={t.addValue}>
      <Stack>
        {/* A plain, controlled box rather than `Field`: `Field` posts a
            `defaultValue`, and this one narrows the list on every keystroke.
            `CONTROL` is the edge `Field` itself draws with. */}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink-muted text-xs">{t.findKey}</span>
          <input
            type="search"
            value={find}
            onChange={(event) => { setFind(event.target.value) }}
            className={`${CONTROL} w-64`}
          />
        </label>
        <p className="text-ink-muted text-xs">{t.shownOf(offered.length, keys.length)}</p>
        {offered.length === 0
          ? <p className="text-ink-muted text-sm">{t.noKey}</p>
          : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {offered.map((key) => (
                  <li key={key.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      icon={<Icon name="plus" />}
                      onClick={() => { onAdd(key) }}
                    >
                      {catalogLabel(key, locale)}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
      </Stack>
    </Fold>
  )
}

/**
 * The numbers under one key.
 *
 * The unit offered is the catalog's list, and the value is converted to the
 * key's own unit on the way in (`app/content/units.ts`) — what is kept here is
 * what the author wrote. **An empty box means the slot is not saved**: there is
 * no "empty number" the way there is an empty piece of prose, so leaving it
 * blank is the same as not having added the value at all.
 *
 * **A row each, because a key holds a list** (`app/content/types.ts`). What a
 * v1 curator wrote as one cell — `常染色体: 5,961,600 SNVs` above
 * `X染色体: 147,353 SNVs` — is two facts, and typing them as two rows is what
 * makes them countable and filterable instead of prose.
 *
 * **The label and the note only appear once they are in use.** Most keys carry
 * a single bare number, and four boxes where one is wanted is a form that asks
 * more than the value does. They come out when there is a second row (which is
 * when "which number is this" starts to have an answer) or when the row already
 * carries one.
 *
 * **The unit is a plain `<select>` wearing `CONTROL`.** A key offers a few
 * units and that is what a select is for, but everything on this screen is held
 * in React state and `form.tsx` の `Select` posts a `defaultValue`.
 */
function NumberField({ label, locale, marks, units, state, rows, onChange }: {
  label: string
  locale: Locale
  marks: Marks
  units: string[]
  state: SlotState
  rows: NumberRow[]
  onChange: (next: { state: SlotState, rows: NumberRow[] }) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const disabled = state !== "value"
  const named = rows.length > 1 || rows.some((row) => row.label !== "" || row.note !== "")
  const box = `${CONTROL} text-sm disabled:opacity-50`
  const edit = (at: number, next: Partial<NumberRow>) => {
    onChange({ state, rows: rows.map((row, i) => (i === at ? { ...row, ...next } : row)) })
  }

  return (
    <Stack gap="tight">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="md:max-w-xl">
        <Stack gap="tight">
          <StateSwitch
            state={state}
            onChange={(next) => { onChange({ state: next, rows }) }}
            locale={locale}
          />
          {rows.map((row, at) => (
            <div key={at} className="flex flex-wrap items-center gap-2">
              {named && (
                <input
                  type="text"
                  value={row.label}
                  disabled={disabled}
                  aria-label={t.numberLabel}
                  placeholder={t.numberLabel}
                  onChange={(event) => { edit(at, { label: event.target.value }) }}
                  className={`${box} w-36`}
                />
              )}
              <input
                type="number"
                step="any"
                value={row.value}
                disabled={disabled}
                aria-label={label}
                onChange={(event) => { edit(at, { value: event.target.value }) }}
                className={`${box} w-40`}
              />
              {units.length > 1
                ? (
                    <select
                      value={row.unit ?? ""}
                      disabled={disabled}
                      aria-label={t.unit}
                      onChange={(event) => { edit(at, { unit: event.target.value }) }}
                      className={box}
                    >
                      {units.map((one) => <option key={one} value={one}>{one}</option>)}
                    </select>
                  )
                : row.unit !== null && <span className="text-ink-muted text-sm">{row.unit}</span>}
              {named && (
                <input
                  type="text"
                  value={row.note}
                  disabled={disabled}
                  aria-label={t.numberNote}
                  placeholder={t.numberNote}
                  onChange={(event) => { edit(at, { note: event.target.value }) }}
                  className={`${box} w-36`}
                />
              )}
              {rows.length > 1 && (
                <IconButton
                  name="close"
                  label={t.removeNumber}
                  disabled={disabled}
                  onClick={() => { onChange({ state, rows: rows.filter((_, i) => i !== at) }) }}
                />
              )}
            </div>
          ))}
          {!disabled && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={<Icon name="plus" />}
                onClick={() => {
                  onChange({ state, rows: [...rows, emptyNumberRow(units[0] ?? null)] })
                }}
              >
                {t.addNumber}
              </Button>
            </div>
          )}
          {!disabled && rows.every((row) => row.value.trim() === "") && (
            <p className="text-ink-muted text-xs">{t.emptyNumber}</p>
          )}
        </Stack>
      </div>
    </Stack>
  )
}

/**
 * A value chosen from a controlled vocabulary. The state sits beside the choice
 * the same way it does beside text: a term that has not been settled is a
 * question, not an absent value.
 *
 * **The chosen values are listed and the rest are searched for**, whether the
 * vocabulary holds three terms or twelve thousand. One shape means the screen
 * does not change under the author when a vocabulary grows, and a list of every
 * ICD10 code is not a control anybody can use.
 *
 * **The candidates come from the server.** Sending a whole vocabulary so that
 * the box can filter it here would make the weight of the page follow the size
 * of the catalog; what is chosen already came with the document, so the choices
 * stay readable whether or not the box is ever used.
 *
 * **A chosen term is one control, and pressing it is what removes it** — the
 * condition and the way to lift it are the same object, as they are for a chip
 * over a listing.
 */
function VocabularyField({
  label,
  locale,
  marks,
  setId,
  chosen: known,
  multiple,
  state,
  termIds,
  onChange,
}: {
  label: string
  locale: Locale
  marks: Marks
  setId: string | null
  /** The terms the document names, which is what the chosen list is drawn from. */
  chosen: EditableTerm[]
  multiple: boolean
  state: SlotState
  termIds: string[]
  onChange: (state: SlotState, termIds: string[]) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const [find, setFind] = useState("")
  const search = useFetcher<EditableTerm[]>()
  const disabled = state !== "value"
  const byId = new Map(known.map((term) => [term.id, term]))
  const chosen = termIds.flatMap((id) => {
    const term = byId.get(id)
    return term === undefined ? [] : [term]
  })

  const needle = find.trim()
  const candidates = (search.data ?? [])
    .filter((term) => term.setId === setId && !termIds.includes(term.id))
    .slice(0, PICKER_RESULTS)

  const look = (value: string) => {
    setFind(value)
    if (setId === null || value.trim() === "") return
    void search.load(
      `${termsPath()}?${new URLSearchParams({ set: setId, q: value.trim() }).toString()}`,
    )
  }

  const add = (id: string) => {
    onChange(state, multiple ? [...termIds, id] : [id])
    setFind("")
  }

  return (
    <Stack gap="tight">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="md:max-w-md">
        <Stack gap="tight">
          <StateSwitch
            state={state}
            onChange={(next) => { onChange(next, termIds) }}
            locale={locale}
          />
          {chosen.length === 0
            ? <p className="text-ink-muted text-sm">{t.noTerm}</p>
            : (
                <ul className="flex flex-wrap gap-2">
                  {chosen.map((term) => (
                    <li key={term.id}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        pill
                        disabled={disabled}
                        onClick={() => {
                          onChange(state, termIds.filter((id) => id !== term.id))
                        }}
                      >
                        {catalogLabel(term, locale)}
                        <Icon name="close" />
                        <span className="sr-only">{t.removeTerm}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
          <input
            type="search"
            value={find}
            disabled={disabled}
            aria-label={t.findTerm}
            placeholder={t.findTerm}
            onChange={(event) => { look(event.target.value) }}
            className={`${CONTROL} text-sm disabled:opacity-50`}
          />
          {needle !== "" && candidates.length === 0 && search.state === "idle" && (
            <p className="text-ink-muted text-sm">{t.noCandidate}</p>
          )}
          {candidates.length > 0 && (
            <ul className="flex flex-col rounded border border-line">
              {candidates.map((term) => (
                <li key={term.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="w-full justify-start"
                    onClick={() => { add(term.id) }}
                  >
                    <code className="text-ink-muted text-xs">{term.code}</code>
                    {catalogLabel(term, locale)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </div>
    </Stack>
  )
}
