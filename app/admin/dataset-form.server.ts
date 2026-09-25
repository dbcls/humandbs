/**
 * Turning what the dataset editor sent back into content.
 *
 * The same two steps as the research side (`form.server.ts`) and for the same
 * reasons: the payload is checked against a schema before anything reads it,
 * and prose is parsed so that **a construct the tree cannot hold stops the
 * whole save** instead of being quietly dropped.
 *
 * What differs is where a problem is reported. A dataset's prose sits under a
 * catalog key, and inside an experiment it sits under a key inside an element,
 * so the path a problem comes back on is the one the screen draws the field at
 * — `values.{keyId}.ja`, `experiments.{id}.values.{keyId}.en`.
 *
 * **Whether a key may be written here is not decided in this file.** A key that
 * the catalog does not know, or one whose type disagrees with the value's kind,
 * is a client that went around the form rather than something an author can
 * fix, so it is answered as a bad request where the catalog is at hand.
 */

import { z } from "zod"

import type {
  ContentValue,
  DatasetContent,
  DiseaseValue,
  Experiment,
  NumberValue,
  ValueSlot,
} from "~/content/types"
import { convert } from "~/content/units"
import { inListingOrder } from "~/files/selection"

import {
  highBelowValue,
  type DatasetContentInput,
  type DiseaseRow,
  type NumberRow,
  type ValueBody,
  type ValueInput,
} from "./dataset-form"
import {
  prosePair,
  slotState,
  textInputSchema,
  textPairSchema,
  textSlot,
} from "./form.server"

/**
 * One number row, as typed. **This shape alone does not refuse a width whose
 * upper end sits below its lower end** — unlike a stray key or a malformed
 * uuid, that is not a shape only a client bypassing the form could produce.
 * The draw preview parses this same schema from content that is still being
 * typed (`datasetPageAction`), and a width caught between two keystrokes is
 * ordinary there. The save path alone refuses it, once parsing has already
 * succeeded (`widthsOrdered`, below).
 */
const numberRowSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  high: z.string(),
  note: z.string(),
})

const valueBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: textPairSchema }),
  z.object({
    kind: z.literal("vocabulary"),
    state: slotState,
    termIds: z.array(z.uuid()),
  }),
  z.object({
    kind: z.literal("number"),
    state: slotState,
    rows: z.array(numberRowSchema),
  }),
  z.object({
    kind: z.literal("disease"),
    state: slotState,
    diseases: z.array(z.object({
      termIds: z.array(z.uuid()),
      nameJa: z.string(),
      nameEn: z.string(),
    })),
  }),
])

/**
 * A key may appear once. It is the identity of the slot — what the conflict
 * diff lines two versions up by and what a comment points at — so a second one
 * would make both ambiguous.
 */
function distinctKeys(values: { keyId: string }[]): boolean {
  return new Set(values.map((value) => value.keyId)).size === values.length
}

const valuesSchema = z
  .array(z.object({ keyId: z.uuid(), value: valueBodySchema }))
  .refine(distinctKeys, "a key may have only one value")

const experimentsSchema = z
  .array(z.object({
    id: z.string().min(1),
    label: textInputSchema,
    values: valuesSchema,
  }))
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    "experiments need distinct identities",
  )

const datasetContentInputSchema = z.object({
  releaseDate: z.union([z.literal(""), z.iso.date()]),
  fileSelection: z.array(z.string()),
  values: valuesSchema,
  experiments: experimentsSchema,
})

/**
 * What one save contains. **The revision is null when the screen was opened
 * before this draft had touched the dataset**, which is what tells an insert
 * apart from an update: the first save creates the entry and finds a conflict
 * by not being the one that created it.
 */
export const saveDatasetSchema = z.object({
  revision: z.number().int().nonnegative().nullable(),
  content: datasetContentInputSchema,
})

/**
 * The stored form of a number: converted to the key's unit, with what was typed
 * kept beside it. Null when there is nothing to store — an empty field, or a unit
 * the key cannot convert from, which the catalog has already refused.
 */
function numberValue(row: NumberRow, canonical: string | null): NumberValue | null {
  const typed = Number(row.value.trim())
  if (row.value.trim() === "" || !Number.isFinite(typed)) return null
  const converted = convert(typed, row.unit, canonical)
  if (converted === null) return null
  const high = highValue(row.high, row.unit, canonical)
  return {
    label: row.label.trim() === "" ? null : row.label.trim(),
    value: converted,
    unit: canonical,
    inputValue: typed,
    inputUnit: row.unit,
    high: high?.converted ?? null,
    inputHigh: high?.typed ?? null,
    note: row.note.trim() === "" ? null : row.note.trim(),
  }
}

/**
 * A width's upper end, converted the same way `value` is. Null when nothing
 * was typed — most rows are a bare value rather than a width — dropped
 * quietly rather than failing the row the way an unreadable `value` does: a
 * width whose upper end cannot be converted is stored as a value with no
 * upper end, not as no value at all. The schema has already refused a typed
 * upper end below the typed value (above), so this only ever narrows or
 * widens the number, never orders it.
 */
function highValue(
  typed: string,
  unit: string | null,
  canonical: string | null,
): { typed: number, converted: number } | null {
  if (typed.trim() === "") return null
  const value = Number(typed.trim())
  if (!Number.isFinite(value)) return null
  const converted = convert(value, unit, canonical)
  return converted === null ? null : { typed: value, converted }
}

/**
 * The stored form of a disease. Null when the row holds nothing — neither a
 * classification's word for it nor anybody else's — which is a row somebody
 * added and left alone rather than a disease.
 */
function diseaseValue(row: DiseaseRow): DiseaseValue | null {
  const nameJa = row.nameJa.trim()
  const nameEn = row.nameEn.trim()
  if (row.termIds.length === 0 && nameJa === "" && nameEn === "") return null
  return {
    termIds: [...row.termIds],
    nameJa: nameJa === "" ? null : nameJa,
    nameEn: nameEn === "" ? null : nameEn,
  }
}

/** The unit a key stores its numbers in, for the keys that store numbers. */
export type CanonicalUnits = (keyId: string) => string | null

function contentValue(body: ValueBody, keyId: string, units: CanonicalUnits): ContentValue | null {
  if (body.kind === "text") return { kind: "text", text: prosePair(body.text) }
  if (body.kind === "vocabulary") {
    return {
      kind: "vocabulary",
      termIds: body.state === "value"
        ? { state: "value", value: [...body.termIds] }
        : { state: body.state },
    }
  }
  if (body.kind === "disease") {
    if (body.state !== "value") return { kind: "disease", diseases: { state: body.state } }
    const held = body.diseases.flatMap((row) => {
      const one = diseaseValue(row)
      return one === null ? [] : [one]
    })
    return held.length === 0
      ? null
      : { kind: "disease", diseases: { state: "value", value: held } }
  }
  if (body.state !== "value") return { kind: "number", values: { state: body.state } }
  const canonical = units(keyId)
  const held = body.rows.flatMap((row) => {
    const one = numberValue(row, canonical)
    return one === null ? [] : [one]
  })
  // An empty field is not a number. There is no "empty number" to store, so a row
  // that holds nothing goes, and a key left with no rows at all loses its slot
  // rather than becoming a value nobody can read.
  return held.length === 0 ? null : { kind: "number", values: { state: "value", value: held } }
}

function valueSlot(input: ValueInput, units: CanonicalUnits): ValueSlot[] {
  const value = contentValue(input.value, input.keyId, units)
  return value === null ? [] : [{ keyId: input.keyId, value }]
}

/** The dataset a form describes, read into what the store holds. */
export function datasetContentOf(input: DatasetContentInput, units: CanonicalUnits): DatasetContent {
  const values = input.values.flatMap((value) => valueSlot(value, units))

  const experiments: Experiment[] = input.experiments.map((experiment) => ({
    id: experiment.id,
    label: textSlot(experiment.label),
    values: experiment.values.flatMap((value) => valueSlot(value, units)),
  }))

  return {
    releaseDate: input.releaseDate === "" ? null : input.releaseDate,
    fileSelection: inListingOrder(input.fileSelection),
    values,
    experiments,
  }
}

/**
 * Whether every number row on the form has its typed upper end at or above
 * its typed lower end.
 *
 * **Only the save path calls this.** The schema above lets a disordered width
 * through because the draw preview parses content that has not finished being
 * typed, and a width caught mid-edit is ordinary there — refusing the whole
 * preview over one field somebody has not finished typing would blank the
 * page they are looking at. A save is different: the screen marks this box
 * `aria-invalid` the moment it is typed (`dataset-editor.tsx` の
 * `NumberField`), so a save that still has the disordered shape is a
 * request that went around the form, and the caller responds to it with a bad
 * request (`app/admin/pages.server.ts` の `saveDatasetAction`).
 */
export function widthsOrdered(input: DatasetContentInput): boolean {
  const rowsOf = (value: ValueInput): NumberRow[] => value.value.kind === "number" ? value.value.rows : []
  const rows = [
    ...input.values.flatMap(rowsOf),
    ...input.experiments.flatMap((experiment) => experiment.values.flatMap(rowsOf)),
  ]
  return rows.every((row) => !highBelowValue(row))
}
