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
 */

import { useState } from "react"
import { Link, useFetcher, type SubmitTarget } from "react-router"

import { diffDatasetInput, takeDatasetField } from "~/admin/dataset-diff"
import { takeAll } from "~/admin/merge"
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
import type { FieldProblem } from "~/admin/form.server"
import type { DatasetEditorView, SaveDatasetResult } from "~/admin/pages.server"
import type { EditableCatalog, EditableKey, EditableTerm } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  adminDraftReviewPath,
  draftCommentsPath,
  draftPresencePath,
  draftUndoPath,
} from "~/admin/urls"
import type { DraftSnapshot } from "~/content/types"
import { termsPath } from "~/admin/urls"
import { catalogLabel } from "~/i18n/catalog-label"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { Page } from "~/components/page"
import { href } from "~/public/urls"
import { threadsByPath } from "~/review/comments"

import { PresenceLine, UndoMenu } from "./draft-tools"
import { FileSelection } from "./files"
import { FieldReview, type FieldReviewData } from "./field-review"
import {
  AddElement,
  ConflictBand,
  ElementCard,
  FieldHead,
  PairField,
  ProblemBand,
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

export function DatasetEditor({ view }: { view: DatasetEditorView }) {
  const locale = view.locale
  const t = messagesFor(locale).admin.datasetEditor
  const fetcher = useFetcher<SaveDatasetResult>()
  const undoFetcher = useFetcher<DraftSnapshot>()

  const [input, setInput] = useState<DatasetContentInput>(view.input)
  const [base, setBase] = useState<DatasetContentInput>(view.input)
  const [revision, setRevision] = useState<number | null>(view.revision)
  const [conflict, setConflict] = useState<
    { theirs: DatasetContentInput, changed: string[] } | null
  >(null)
  const [upstream, setUpstream] = useState(view.upstream)
  const [problems, setProblems] = useState<FieldProblem[]>([])
  const [saved, setSaved] = useState(false)
  const [sent, setSent] = useState<DatasetContentInput>(view.input)
  const [answered, setAnswered] = useState<SaveDatasetResult | null>(null)
  const [restored, setRestored] = useState<DraftSnapshot | null>(null)
  const [missing, setMissing] = useState(false)

  // Taken while rendering rather than in an effect: which fields the other
  // version moved has to be worked out against the version this screen still
  // holds, and only then is that version replaced.
  const answer = fetcher.state === "idle" ? fetcher.data : undefined
  if (answer !== undefined && answer !== answered) {
    setAnswered(answer)
    setSaved(answer.status === "saved")
    if (answer.status === "saved") {
      setRevision(answer.revision)
      setBase(sent)
      setConflict(null)
      setProblems([])
    } else if (answer.status === "invalid") {
      setProblems(answer.problems)
    } else {
      setConflict({ theirs: answer.current, changed: diffDatasetInput(base, answer.current) })
      setRevision(answer.revision)
      setBase(answer.current)
      setProblems([])
    }
  }

  // A snapshot holds the whole draft; this screen takes the part of it that is
  // this dataset. One taken before the draft had touched the dataset has no
  // part to take, which is worth saying rather than silently doing nothing.
  const snapshot = undoFetcher.state === "idle" ? undoFetcher.data : undefined
  if (snapshot !== undefined && snapshot !== restored) {
    setRestored(snapshot)
    const entry = snapshot.datasetEntries.find((row) => row.datasetId === view.datasetId)
    setMissing(entry === undefined)
    if (entry !== undefined) {
      setInput(datasetContentInput(entry.content))
      setSaved(false)
      setProblems([])
    }
  }

  const dirty = diffDatasetInput(base, input).length > 0

  function edit(next: DatasetContentInput): void {
    setInput(next)
    setSaved(false)
  }

  function save(): void {
    setSent(input)
    const payload = { revision, content: input } as unknown as SubmitTarget
    void fetcher.submit(payload, { method: "post", encType: "application/json" })
  }

  /**
   * Taking everything only the other publish touched. What both sides touched
   * is left where it is: each of those is a choice, and the mark beside the
   * field is where it is made.
   */
  function takeUpstream(): void {
    if (upstream === null) return
    edit(takeAll(takeDatasetField, input, upstream.theirs, upstream.only))
    setUpstream({ ...upstream, only: [] })
  }

  /**
   * A field can be marked from two directions — a save somebody refused, and a
   * publish that moved the description this draft copied. The refusal wins when
   * both apply: it is the more recent of the two.
   */
  function marksFor(path: string): Marks {
    const refused = conflict?.changed.includes(path) ?? false
    const moved = upstream?.both.includes(path) ?? false
    const theirs = refused ? conflict?.theirs : moved ? upstream?.theirs : undefined
    return {
      changed: refused || moved,
      onTake: theirs === undefined
        ? null
        : () => {
            edit(takeDatasetField(input, theirs, path))
            if (!refused && upstream !== null) {
              setUpstream({ ...upstream, both: upstream.both.filter((held) => held !== path) })
            }
          },
      problems: problems.filter((problem) => problem.path.startsWith(`${path}.`)),
      extra: <FieldReview review={review} at={path} />,
    }
  }

  const subject = { kind: "dataset" as const, datasetId: view.datasetId }
  const termLabelOf = new Map(view.terms.map((term) => [term.id, catalogLabel(term, locale)]))
  const review: FieldReviewData = {
    context: {
      locale,
      action: href(locale, draftCommentsPath(view.researchId, view.draftId)),
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

  return (
    <Page>
      <div className="sticky top-0 z-10 mb-4 border-line border-b bg-white py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="font-bold text-lg">
              {view.datasetLabel ?? messagesFor(locale).admin.editor.unpinnedDataset}
            </h1>
            <Link
              to={href(locale, adminDraftDatasetsPath(view.researchId, view.draftId))}
              className="text-sm"
            >
              {t.backToList}
            </Link>
            <Link
              to={href(locale, adminDraftPath(view.researchId, view.draftId))}
              className="text-sm"
            >
              {t.backToDraft}
            </Link>
            <Link
              to={href(locale, adminDraftReviewPath(view.researchId, view.draftId))}
              className="text-sm"
            >
              {messagesFor(locale).admin.editor.review}
            </Link>
            {!view.published && (
              <span className="text-ink-muted text-xs">
                {messagesFor(locale).admin.detail.unpublishedDataset}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {dirty && <span className="text-accent">{messagesFor(locale).admin.editor.unsaved}</span>}
            {!dirty && saved && (
              <span className="text-ink-muted">{messagesFor(locale).admin.editor.saved}</span>
            )}
            <UndoMenu
              locale={locale}
              entries={view.undo}
              onPick={(undoId) => {
                void undoFetcher.load(draftUndoPath(view.researchId, view.draftId, undoId))
              }}
              loading={undoFetcher.state !== "idle"}
            />
            <button
              type="button"
              onClick={save}
              disabled={fetcher.state !== "idle"}
              className="cursor-pointer rounded bg-brand px-4 py-1.5 font-semibold text-white disabled:opacity-60"
            >
              {fetcher.state === "idle"
                ? messagesFor(locale).admin.editor.save
                : messagesFor(locale).admin.editor.saving}
            </button>
          </div>
        </div>
        <PresenceLine
          locale={locale}
          path={draftPresencePath(view.researchId, view.draftId)}
          initial={view.presence}
        />
      </div>

      {view.review.changed.length > 0 && (
        <p className="mb-4 rounded border border-line bg-surface px-4 py-2 text-sm">
          {messagesFor(locale).admin.editor.differsCount(view.review.changed.length)}
        </p>
      )}
      {conflict !== null && <ConflictBand locale={locale} changed={conflict.changed} />}
      {upstream !== null && (upstream.only.length > 0 || upstream.both.length > 0) && (
        <UpstreamBand
          locale={locale}
          only={upstream.only}
          both={upstream.both}
          onTakeAll={takeUpstream}
        />
      )}
      {problems.length > 0 && <ProblemBand locale={locale} problems={problems} />}
      {missing && (
        <p className="mb-4 rounded border border-line bg-surface px-4 py-2 text-sm">
          {t.undoWithoutEntry}
        </p>
      )}

      <section id="basics" className="mt-8 scroll-mt-32">
        <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{t.basics}</h2>
        <div className="mt-2">
          <FieldHead label={t.releaseDate} marks={marksFor("releaseDate")} locale={locale} />
          <p className="mt-1 text-ink-muted text-xs">{t.releaseDateHint}</p>
          <input
            type="date"
            className="mt-1 rounded border border-line px-2 py-1 text-sm"
            value={input.releaseDate}
            onChange={(event) => { edit({ ...input, releaseDate: event.target.value }) }}
          />
        </div>
        <Values
          locale={locale}
          catalog={view.catalog}
          terms={view.terms}
          scope="dataset"
          path="values"
          values={input.values}
          marksFor={marksFor}
          onChange={(values) => { edit({ ...input, values }) }}
        />
      </section>

      {/*
        Only a dataset the portal issued the id for. An archive's dataset is
        distributed by the archive, so there is nothing here to choose from and
        a selection on one is refused on save.
      */}
      {view.portalIssued && (
        <section id="files" className="mt-8 scroll-mt-32">
          <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">{t.files}</h2>
          <FieldHead label={t.files} marks={marksFor("fileSelection")} locale={locale} />
          <FileSelection
            locale={locale}
            listing={view.box}
            selected={input.fileSelection}
            onChange={(fileSelection) => { edit({ ...input, fileSelection }) }}
          />
        </section>
      )}

      <section id="experiments" className="mt-8 scroll-mt-32">
        <h2 className="mb-3 border-line border-b pb-1 font-semibold text-brand">
          {t.experiments}
        </h2>
        <FieldHead label={t.experiments} marks={marksFor("experiments")} locale={locale} />
        {input.experiments.map((experiment, at) => (
          <ElementCard
            key={experiment.id}
            index={at}
            count={input.experiments.length}
            locale={locale}
            onMove={(by) => { edit({ ...input, experiments: moved(input.experiments, at, by) }) }}
            onRemove={() => {
              edit({
                ...input,
                experiments: input.experiments.filter((row) => row.id !== experiment.id),
              })
            }}
          >
            <Experiment
              locale={locale}
              catalog={view.catalog}
              terms={view.terms}
              experiment={experiment}
              marksFor={marksFor}
              onChange={(next) => {
                edit({ ...input, experiments: replacing(input.experiments, experiment.id, next) })
              }}
            />
          </ElementCard>
        ))}
        <AddElement
          label={t.addExperiment}
          onClick={() => {
            edit({
              ...input,
              experiments: [
                ...input.experiments,
                { id: newId(), label: emptySlot(), values: [] },
              ],
            })
          }}
        />
      </section>
    </Page>
  )
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
    <>
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
    </>
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
    <div className="mt-3">
      <FieldHead label={t.values} marks={marksFor(path)} locale={locale} />
      {inOrder.map((value) => {
        const key = keyById.get(value.keyId)
        if (key === undefined) return null
        const at = `${path}.${value.keyId}`
        const body = value.value
        return (
          <div key={value.keyId} className="mt-3">
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
            <div className="mt-1">
              <button
                type="button"
                onClick={() => { onChange(values.filter((row) => row.keyId !== value.keyId)) }}
                className="cursor-pointer text-ink-muted text-xs underline"
              >
                {t.removeValue}
              </button>
            </div>
          </div>
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
    </div>
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

function AddValue({ locale, keys, onAdd }: {
  locale: Locale
  keys: EditableKey[]
  onAdd: (key: EditableKey) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const [chosen, setChosen] = useState("")

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        aria-label={t.addValue}
        className="rounded border border-line px-2 py-1 text-sm"
        value={chosen}
        onChange={(event) => { setChosen(event.target.value) }}
      >
        <option value="">{t.chooseKey}</option>
        {keys.map((key) => (
          <option key={key.id} value={key.id}>{catalogLabel(key, locale)}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={chosen === ""}
        onClick={() => {
          const key = keys.find((candidate) => candidate.id === chosen)
          if (key !== undefined) onAdd(key)
          setChosen("")
        }}
        className="cursor-pointer rounded border border-brand px-3 py-1 text-brand text-sm disabled:opacity-50"
      >
        {t.addValue}
      </button>
    </div>
  )
}

/**
 * A number and the unit it was typed in.
 *
 * The unit offered is the catalog's list, and the value is converted to the
 * key's own unit on the way in (`app/content/units.ts`) — what is kept here is
 * what the author wrote. **An empty box means the slot is not saved**: there is
 * no "empty number" the way there is an empty piece of prose, so leaving it
 * blank is the same as not having added the value at all.
 */
/**
 * The numbers under one key.
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
  const edit = (at: number, next: Partial<NumberRow>) => {
    onChange({ state, rows: rows.map((row, i) => (i === at ? { ...row, ...next } : row)) })
  }

  return (
    <div className="mt-4 first:mt-0">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 flex flex-col gap-2 md:max-w-xl">
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
                className="w-36 rounded border border-line bg-surface-input px-2 py-1"
              />
            )}
            <input
              type="number"
              step="any"
              value={row.value}
              disabled={disabled}
              aria-label={label}
              onChange={(event) => { edit(at, { value: event.target.value }) }}
              className="w-40 rounded border border-line bg-surface-input px-2 py-1"
            />
            {units.length > 1
              ? (
                  <select
                    value={row.unit ?? ""}
                    disabled={disabled}
                    aria-label={t.unit}
                    onChange={(event) => { edit(at, { unit: event.target.value }) }}
                    className="rounded border border-line bg-surface-input px-2 py-1"
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
                className="w-36 rounded border border-line bg-surface-input px-2 py-1"
              />
            )}
            {rows.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => { onChange({ state, rows: rows.filter((_, i) => i !== at) }) }}
                className="cursor-pointer text-ink-muted text-xs underline"
              >
                {t.removeNumber}
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange({ state, rows: [...rows, emptyNumberRow(units[0] ?? null)] })
            }}
            className="cursor-pointer self-start text-brand text-xs underline"
          >
            {t.addNumber}
          </button>
        )}
        {!disabled && rows.every((row) => row.value.trim() === "") && (
          <p className="text-ink-muted text-xs">{t.emptyNumber}</p>
        )}
      </div>
    </div>
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
    <div className="mt-4 first:mt-0">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 flex flex-col gap-2 md:max-w-md">
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
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => { onChange(state, termIds.filter((id) => id !== term.id)) }}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-brand px-3 py-1 text-sm"
                    >
                      {catalogLabel(term, locale)}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only">{t.removeTerm}</span>
                    </button>
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
          className="rounded border border-line bg-surface-input px-2 py-1 text-sm"
        />
        {needle !== "" && candidates.length === 0 && search.state === "idle" && (
          <p className="text-ink-muted text-sm">{t.noCandidate}</p>
        )}
        {candidates.length > 0 && (
          <ul className="flex flex-col border border-line text-sm">
            {candidates.map((term) => (
              <li key={term.id}>
                <button
                  type="button"
                  onClick={() => { add(term.id) }}
                  className="flex w-full cursor-pointer items-baseline gap-2 px-2 py-1 text-left hover:bg-surface-hover"
                >
                  <code className="text-ink-muted text-xs">{term.code}</code>
                  {catalogLabel(term, locale)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
