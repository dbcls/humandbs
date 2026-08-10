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
  emptyValueInput,
  type DatasetContentInput,
  type ExperimentInput,
  type ValueInput,
} from "~/admin/dataset-form"
import type { SlotState } from "~/admin/form"
import type { FieldProblem } from "~/admin/form.server"
import type { DatasetEditorView, SaveDatasetResult } from "~/admin/pages.server"
import type { EditableCatalog, EditableKey, EditableTerm } from "~/admin/queries.server"
import {
  adminDraftDatasetsPath,
  adminDraftPath,
  draftPresencePath,
  draftUndoPath,
} from "~/admin/urls"
import type { DraftSnapshot } from "~/content/types"
import type { Locale } from "~/i18n/locale"
import { messagesFor } from "~/i18n/messages"
import { href } from "~/public/urls"

import { PresenceLine, UndoMenu } from "./draft-tools"
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

function keyLabel(key: EditableKey, locale: Locale): string {
  return locale === "ja" ? key.labelJa : key.labelEn
}

function termLabel(term: EditableTerm, locale: Locale): string {
  return locale === "ja" ? term.labelJa ?? term.labelEn : term.labelEn
}

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
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
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
              className="cursor-pointer rounded-sm bg-brand px-4 py-1.5 font-semibold text-white disabled:opacity-60"
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
        <p className="mb-4 rounded-sm border border-line bg-surface px-4 py-2 text-sm">
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
            className="mt-1 rounded-sm border border-line px-2 py-1 text-sm"
            value={input.releaseDate}
            onChange={(event) => { edit({ ...input, releaseDate: event.target.value }) }}
          />
        </div>
        <Values
          locale={locale}
          catalog={view.catalog}
          scope="dataset"
          path="values"
          values={input.values}
          marksFor={marksFor}
          onChange={(values) => { edit({ ...input, values }) }}
        />
      </section>

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
    </div>
  )
}

function Experiment({ locale, catalog, experiment, marksFor, onChange }: {
  locale: Locale
  catalog: EditableCatalog
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
function Values({ locale, catalog, scope, path, values, marksFor, onChange }: {
  locale: Locale
  catalog: EditableCatalog
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
        return (
          <div key={value.keyId} className="mt-3">
            {value.value.kind === "text"
              ? (
                  <PairField
                    label={keyLabel(key, locale)}
                    value={value.value.text}
                    multiline
                    marks={marksFor(at)}
                    locale={locale}
                    onChange={(text) => {
                      replace(value.keyId, { keyId: value.keyId, value: { kind: "text", text } })
                    }}
                  />
                )
              : (
                  <VocabularyField
                    label={keyLabel(key, locale)}
                    locale={locale}
                    marks={marksFor(at)}
                    terms={catalog.terms.filter((term) => term.setId === key.vocabularySetId)}
                    multiple={key.multiple}
                    state={value.value.state}
                    termIds={value.value.termIds}
                    onChange={(state, termIds) => {
                      replace(value.keyId, {
                        keyId: value.keyId,
                        value: { kind: "vocabulary", state, termIds },
                      })
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
            onChange([...values, emptyValueInput(key.id, key.valueType === "vocabulary" ? "vocabulary" : "text")])
          }}
        />
      )}
    </div>
  )
}

/**
 * Whether the editor has an input control for a key. Only the two kinds the
 * catalog uses are editable; the rest arrive with the layer that gives them a
 * control, an aggregation and a unit.
 */
function isEditable(key: EditableKey): boolean {
  return key.valueType === "text" || key.valueType === "vocabulary"
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
        className="rounded-sm border border-line px-2 py-1 text-sm"
        value={chosen}
        onChange={(event) => { setChosen(event.target.value) }}
      >
        <option value="">{t.chooseKey}</option>
        {keys.map((key) => (
          <option key={key.id} value={key.id}>{keyLabel(key, locale)}</option>
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
        className="cursor-pointer rounded-sm border border-brand px-3 py-1 text-brand text-sm disabled:opacity-50"
      >
        {t.addValue}
      </button>
    </div>
  )
}

/**
 * A value chosen from a controlled vocabulary. The state sits beside the choice
 * the same way it does beside text: a term that has not been settled is a
 * question, not an absent value.
 */
function VocabularyField({ label, locale, marks, terms, multiple, state, termIds, onChange }: {
  label: string
  locale: Locale
  marks: Marks
  terms: EditableTerm[]
  multiple: boolean
  state: SlotState
  termIds: string[]
  onChange: (state: SlotState, termIds: string[]) => void
}) {
  const t = messagesFor(locale).admin.datasetEditor
  const disabled = state !== "value"

  return (
    <div className="mt-4 first:mt-0">
      <FieldHead label={label} marks={marks} locale={locale} />
      <div className="mt-1 flex flex-col gap-2 md:max-w-md">
        <StateSwitch
          state={state}
          onChange={(next) => { onChange(next, termIds) }}
          locale={locale}
        />
        <ul className="flex flex-col gap-1 text-sm">
          {!multiple && (
            <li>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={termIds.length === 0}
                  disabled={disabled}
                  onChange={() => { onChange(state, []) }}
                />
                <span className="text-ink-muted">{t.noTerm}</span>
              </label>
            </li>
          )}
          {terms.map((term) => (
            <li key={term.id}>
              <label className="flex items-center gap-2">
                <input
                  type={multiple ? "checkbox" : "radio"}
                  checked={termIds.includes(term.id)}
                  disabled={disabled}
                  onChange={(event) => {
                    if (!multiple) {
                      onChange(state, [term.id])
                      return
                    }
                    onChange(
                      state,
                      event.target.checked
                        ? [...termIds, term.id]
                        : termIds.filter((id) => id !== term.id),
                    )
                  }}
                />
                {termLabel(term, locale)}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
