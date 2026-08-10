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

import { parseRichText } from "~/content/parse.server"
import type {
  ContentValue,
  DatasetContent,
  Experiment,
  NumberValue,
  RichText,
  Slot,
  TranslatedRichText,
  ValueSlot,
} from "~/content/types"
import { convert } from "~/content/units"

import type { DatasetContentInput, ValueBody, ValueInput } from "./dataset-form"
import type { FieldProblem } from "./form.server"
import type { TextInput, TextPairInput } from "./form"

const slotState = z.enum(["value", "unknown", "not-applicable"])

const textInputSchema = z.object({ state: slotState, text: z.string() })
const textPairSchema = z.object({ ja: textInputSchema, en: textInputSchema })

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
    value: z.string(),
    unit: z.string().nullable(),
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
  .refine(distinctKeys, "a key may carry only one value")

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
 * What one save carries. **The revision is null when the screen was opened
 * before this draft had touched the dataset**, which is what tells an insert
 * apart from an update: the first save creates the entry and finds a conflict
 * by not being the one that created it.
 */
export const saveDatasetSchema = z.object({
  revision: z.number().int().nonnegative().nullable(),
  content: datasetContentInputSchema,
})

export type SaveDatasetPayload = z.infer<typeof saveDatasetSchema>

export type DatasetContentResult
  = | { ok: true, content: DatasetContent }
    | { ok: false, problems: FieldProblem[] }

/** Whatever was typed is dropped once the state says there is no value. */
function textSlot(input: TextInput): Slot<string> {
  return input.state === "value" ? { state: "value", value: input.text } : { state: input.state }
}

function prosePair(
  pair: TextPairInput,
  path: string,
  problems: FieldProblem[],
): TranslatedRichText {
  const side = (input: TextInput, language: string): Slot<RichText> => {
    if (input.state !== "value") return { state: input.state }
    const result = parseRichText(input.text)
    if (result.ok) return { state: "value", value: result.value }
    for (const problem of result.problems) {
      problems.push({ path: `${path}.${language}`, syntax: problem.syntax, line: problem.line })
    }
    return { state: "value", value: [] }
  }
  return { ja: side(pair.ja, "ja"), en: side(pair.en, "en") }
}

/**
 * The stored form of a number: converted to the key's unit, with what was typed
 * kept beside it. Null when there is nothing to store — an empty box, or a unit
 * the key cannot convert from, which the catalog has already refused.
 */
function numberValue(
  body: Extract<ValueBody, { kind: "number" }>,
  canonical: string | null,
): NumberValue | null {
  const typed = Number(body.value.trim())
  if (body.value.trim() === "" || !Number.isFinite(typed)) return null
  const converted = convert(typed, body.unit, canonical)
  if (converted === null) return null
  return { value: converted, unit: canonical, inputValue: typed, inputUnit: body.unit }
}

/** The unit a key stores its numbers in, for the keys that store numbers. */
export type CanonicalUnits = (keyId: string) => string | null

function contentValue(
  body: ValueBody,
  keyId: string,
  path: string,
  problems: FieldProblem[],
  units: CanonicalUnits,
): ContentValue | null {
  if (body.kind === "text") return { kind: "text", text: prosePair(body.text, path, problems) }
  if (body.kind === "vocabulary") {
    return {
      kind: "vocabulary",
      termIds: body.state === "value"
        ? { state: "value", value: [...body.termIds] }
        : { state: body.state },
    }
  }
  if (body.state !== "value") return { kind: "number", value: { state: body.state } }
  const held = numberValue(body, units(keyId))
  // An empty box is not a number. There is no "empty number" to store, so the
  // slot goes rather than becoming a value nobody can read.
  return held === null ? null : { kind: "number", value: { state: "value", value: held } }
}

function valueSlot(
  input: ValueInput,
  path: string,
  problems: FieldProblem[],
  units: CanonicalUnits,
): ValueSlot[] {
  const value = contentValue(
    input.value,
    input.keyId,
    `${path}.${input.keyId}`,
    problems,
    units,
  )
  return value === null ? [] : [{ keyId: input.keyId, value }]
}

/**
 * Problems come back in the order the form shows the fields, which is why the
 * dataset's own values are read before its experiments: a list of refusals is
 * read from the top of the screen down, and one that jumps about makes the
 * author hunt for each of them.
 */
export function datasetContentOf(
  input: DatasetContentInput,
  units: CanonicalUnits,
): DatasetContentResult {
  const problems: FieldProblem[] = []

  const values = input.values.flatMap((value) => valueSlot(value, "values", problems, units))

  const experiments: Experiment[] = input.experiments.map((experiment) => ({
    id: experiment.id,
    label: textSlot(experiment.label),
    values: experiment.values.flatMap((value) =>
      valueSlot(value, `experiments.${experiment.id}.values`, problems, units)),
  }))

  const content: DatasetContent = {
    releaseDate: input.releaseDate === "" ? null : input.releaseDate,
    fileSelection: [...input.fileSelection],
    values,
    experiments,
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, content }
}
