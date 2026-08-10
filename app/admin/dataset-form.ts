/**
 * The shape a dataset is edited in.
 *
 * It stands to `DatasetContent` as `form.ts` stands to `ResearchContent`, and
 * for the same two reasons: prose is markdown while a person is typing it, and
 * a slot keeps its text whatever its state says so that marking a value
 * unsettled does not eat what was half written.
 *
 * **A value carries the kind of its catalog key.** The kind is stored with the
 * value rather than looked up, so a form can be built without the catalog, and
 * a value whose kind disagrees with its key never gets that far — the write
 * path checks it. Only the two kinds the catalog actually uses are editable
 * here; a key typed as a single value, an accession or a number has no input
 * control yet, and one turning up is a fault rather than something to render
 * blank, because a value nobody can see is a value nobody can keep.
 *
 * **Experiments are part of this form.** They live inside the dataset's content
 * (`app/content/types.ts`), so editing one is a change to the dataset and is
 * checked against the dataset entry's revision, not one of their own.
 *
 * Paths are spelled as they are everywhere else in editing: `values.{keyId}`,
 * `experiments.{experimentId}.label`,
 * `experiments.{experimentId}.values.{keyId}`. A value slot is identified by
 * the key it is under, which is also how a comment addresses one.
 */

import { toMarkdown } from "~/content/richtext"
import type {
  ContentValue,
  DatasetContent,
  Experiment,
  RichText,
  Slot,
  TranslatedRichText,
  ValueSlot,
} from "~/content/types"

import type { SlotState, TextInput, TextPairInput } from "./form"

/** The editable kinds. The catalog uses these three and nothing else yet. */
export type ValueKind = "text" | "vocabulary" | "number"

export type ValueBody
  = | { kind: "text", text: TextPairInput }
    | { kind: "vocabulary", state: SlotState, termIds: string[] }
    /**
     * What was typed and the unit it was typed in — not the converted value.
     * The conversion happens once on the way in (`app/content/units.ts`), and
     * the editor has to show the author what they wrote rather than what it
     * became. **An empty box is not a number**: the slot is left out on save,
     * because a number that is not there has no representation the way an empty
     * piece of prose does.
     */
    | { kind: "number", state: SlotState, value: string, unit: string | null }

export interface ValueInput {
  keyId: string
  value: ValueBody
}

export interface ExperimentInput {
  id: string
  label: TextInput
  values: ValueInput[]
}

export interface DatasetContentInput {
  /** Empty when there is no date. Only NHA IDs carry one. */
  releaseDate: string
  /**
   * Carried through untouched. The screen that selects files is a later layer,
   * and a form that dropped what it does not show would erase the selection on
   * the next save.
   */
  fileSelection: string[]
  values: ValueInput[]
  experiments: ExperimentInput[]
}

export class UneditableValueKind extends Error {
  constructor(readonly keyId: string, readonly kind: string) {
    super(`the value under ${keyId} is a ${kind}, which has no input control`)
    this.name = "UneditableValueKind"
  }
}

function textInput(slot: Slot<string>): TextInput {
  return slot.state === "value"
    ? { state: "value", text: slot.value }
    : { state: slot.state, text: "" }
}

function proseInput(slot: Slot<RichText>): TextInput {
  return slot.state === "value"
    ? { state: "value", text: toMarkdown(slot.value) }
    : { state: slot.state, text: "" }
}

function prosePair(pair: TranslatedRichText): TextPairInput {
  return { ja: proseInput(pair.ja), en: proseInput(pair.en) }
}

function valueBody(keyId: string, value: ContentValue): ValueBody {
  switch (value.kind) {
    case "text":
      return { kind: "text", text: prosePair(value.text) }
    case "vocabulary":
      return value.termIds.state === "value"
        ? { kind: "vocabulary", state: "value", termIds: [...value.termIds.value] }
        : { kind: "vocabulary", state: value.termIds.state, termIds: [] }
    case "number":
      return value.value.state === "value"
        ? {
            kind: "number",
            state: "value",
            value: String(value.value.value.inputValue),
            unit: value.value.value.inputUnit,
          }
        : { kind: "number", state: value.value.state, value: "", unit: null }
    default:
      throw new UneditableValueKind(keyId, value.kind)
  }
}

function valueInput(slot: ValueSlot): ValueInput {
  return { keyId: slot.keyId, value: valueBody(slot.keyId, slot.value) }
}

function experimentInput(experiment: Experiment): ExperimentInput {
  return {
    id: experiment.id,
    label: textInput(experiment.label),
    values: experiment.values.map(valueInput),
  }
}

/** What the editing screen is handed. Total, and the same for every state. */
export function datasetContentInput(content: DatasetContent): DatasetContentInput {
  return {
    releaseDate: content.releaseDate ?? "",
    fileSelection: [...content.fileSelection],
    values: content.values.map(valueInput),
    experiments: content.experiments.map(experimentInput),
  }
}

/**
 * An empty slot under a key of the given kind, for adding one to a form. A
 * number starts in the unit its key stores, which is the one an author is most
 * likely to be reading off a table.
 */
export function emptyValueInput(keyId: string, kind: ValueKind, unit?: string | null): ValueInput {
  switch (kind) {
    case "text":
      return {
        keyId,
        value: {
          kind: "text",
          text: { ja: { state: "value", text: "" }, en: { state: "value", text: "" } },
        },
      }
    case "vocabulary":
      return { keyId, value: { kind: "vocabulary", state: "value", termIds: [] } }
    case "number":
      return { keyId, value: { kind: "number", state: "value", value: "", unit: unit ?? null } }
  }
}
