/**
 * Generators for what the editing screen holds.
 *
 * Element identities are drawn from a positional pool rather than freely, so
 * that two independently generated drafts share some of them. Without that,
 * every element would look added-and-removed to the diff and the per-element
 * paths — the ones a comment will later point at — would never be exercised.
 */

import fc from "fast-check"

import {
  KEY_IDS,
  researchContentArb,
  slotArb,
  translatedRichTextArb,
} from "~/content/arbitraries/content"
import type {
  ContentValue,
  DatasetContent,
  NumberValue,
  ResearchContent,
  ValueSlot,
} from "~/content/types"

import { datasetContentInput, type DatasetContentInput } from "../dataset-form"
import { researchContentInput, type DraftInput, type ResearchContentInput } from "../form"

function positional(content: ResearchContent): ResearchContent {
  return {
    ...content,
    dataProviders: content.dataProviders.map((row, at) => ({ ...row, id: `provider-${at}` })),
    researchProjects: content.researchProjects.map((row, at) => ({ ...row, id: `project-${at}` })),
    grants: content.grants.map((row, at) => ({ ...row, id: `grant-${at}` })),
    relatedPublications: content.relatedPublications
      .map((row, at) => ({ ...row, id: `publication-${at}` })),
  }
}

export const researchContentInputArb: fc.Arbitrary<ResearchContentInput> = researchContentArb
  .map((content) => researchContentInput(positional(content)))

export const draftInputArb: fc.Arbitrary<DraftInput> = fc.record({
  note: fc.string(),
  content: researchContentInputArb,
})

/**
 * A dataset as the editor holds it.
 *
 * **All three kinds that have an input control are drawn**, so that a kind the
 * diff has no answer for shows up as a draft that never stops differing from
 * itself. The other kinds have no form to be in, and the write path refuses
 * them long before a diff would see one. Keys are drawn as a subset of the same
 * fixed pool so that two independently generated datasets share some — with
 * free keys every slot would look added-and-removed and the per-slot paths
 * would never be exercised — and a subset rather than an array so that a key
 * appears at most once, which is what makes it the identity of the slot.
 */
const editableValueArb = (keyId: string): fc.Arbitrary<ContentValue> => fc.oneof(
  fc.record({ kind: fc.constant("text" as const), text: translatedRichTextArb }),
  fc.record({
    kind: fc.constant("vocabulary" as const),
    termIds: slotArb(fc.subarray(["term-a", "term-b", "term-c"])),
  }),
  fc.record({
    kind: fc.constant("number" as const),
    value: slotArb(numberValueArb(CANONICAL_UNITS(keyId))),
  }),
)

/**
 * The unit each key in the pool stores its numbers in, so that a test can hand
 * the save path the same answer the generated content was built against. A
 * number is stored converted, and a conversion the form cannot repeat is a slot
 * that comes back as something else — which is a fault of the fixture rather
 * than of the code under test.
 */
export function CANONICAL_UNITS(keyId: string): string | null {
  if (keyId === "key-b") return "GB"
  return keyId === "key-c" ? "bp" : null
}

/** A stored number under a key with the given unit: already in that unit. */
function numberValueArb(unit: string | null): fc.Arbitrary<NumberValue> {
  const held = fc.integer({ min: -1_000_000, max: 1_000_000 })
  return held.map((value) => ({ value, unit, inputValue: value, inputUnit: unit }))
}

const valuesArb: fc.Arbitrary<ValueSlot[]> = fc
  .subarray([...KEY_IDS])
  .chain((keyIds) => fc.tuple(...keyIds.map((keyId) =>
    editableValueArb(keyId).map((value): ValueSlot => ({ keyId, value })))))

export const datasetContentForEditorArb: fc.Arbitrary<DatasetContent> = fc.record({
  releaseDate: fc.option(fc.constantFrom("2020-01-01", "2024-12-31"), { nil: null }),
  fileSelection: fc.subarray(["a.zip", "b.zip", "c.pdf"]),
  values: valuesArb,
  experiments: fc
    .array(fc.record({ label: slotArb(fc.string()), values: valuesArb }), { maxLength: 3 })
    .map((rows) => rows.map((row, at) => ({ ...row, id: `experiment-${at}` }))),
})

export const datasetContentInputArb: fc.Arbitrary<DatasetContentInput>
  = datasetContentForEditorArb.map(datasetContentInput)
