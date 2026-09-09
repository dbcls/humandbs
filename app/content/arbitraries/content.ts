/**
 * Generators for content values.
 *
 * Kept apart from the tests that use them so that a law about content is written
 * against the same input space wherever it is stated.
 *
 * Two choices shape that space. Catalog keys are drawn from a handful of fixed
 * ids so that a generated catalog and a generated value slot actually meet —
 * with free ids every slot would be dropped for an unknown key and the laws
 * would hold vacuously. File names are drawn the same way, so that a selection
 * sometimes names a listed file and sometimes does not.
 *
 * A translated pair draws a state per language, so the space holds the mixtures
 * the laws have to survive: settled on one side and a question on the other.
 */

import fc from "fast-check"

import type {
  ContentValue,
  DatasetContent,
  Experiment,
  LocalizedLinks,
  NumberValue,
  ResearchContent,
  RichText,
  Slot,
  Span,
  TranslatedRichText,
  TranslatedText,
  ValueSlot,
} from "../types"

import type { CatalogKey, StoredFile } from "../public"

export const KEY_IDS = ["key-a", "key-b", "key-c", "key-d"] as const
export const FILE_NAMES = ["a.zip", "b.zip", "c.pdf", "d.txt"] as const

const idArb = fc.string({ minLength: 1, maxLength: 8 })
const keyIdArb = fc.constantFrom(...KEY_IDS)
const fileNameArb = fc.constantFrom(...FILE_NAMES)
const dateArb = fc.option(fc.constantFrom("2020-01-01", "2024-12-31"), { nil: null })

/**
 * All three states, so that dropping one is visible and keeping two is checked.
 * Holding a value is weighted because a translated pair draws twice: with three
 * equal states the two sides would both hold one in a ninth of the samples, and
 * the laws about untranslated pairs need both sides settled to say anything.
 */
export function slotArb<T>(value: fc.Arbitrary<T>): fc.Arbitrary<Slot<T>> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.record({ state: fc.constant("value" as const), value }) },
    { weight: 1, arbitrary: fc.constant<Slot<T>>({ state: "unknown" }) },
    { weight: 1, arbitrary: fc.constant<Slot<T>>({ state: "not-applicable" }) },
  )
}

/** Empty is drawn on purpose: an empty side is what makes a pair untranslated. */
const textArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 3, arbitrary: fc.string({ minLength: 1 }) },
)

export const translatedTextArb: fc.Arbitrary<TranslatedText> = fc.record({
  ja: slotArb(textArb),
  en: slotArb(textArb),
})

/** A span's text never holds a newline: that is what a line boundary is. */
const spanTextArb = fc.string().map((text) => text.replaceAll("\n", " "))

/**
 * Destinations are drawn from a fixed set with both kinds in it, so that a law
 * about what may be followed sees the ones that may not.
 */
const hrefArb = fc.constantFrom(
  "https://ddbj.nig.ac.jp/",
  "/nbdc-policy",
  "mailto:someone@example.com",
  "javascript:alert(1)",
  "//example.com/",
)

const spanArb: fc.Arbitrary<Span> = fc.oneof(
  fc.record({ text: spanTextArb }),
  fc.record({ text: spanTextArb, href: hrefArb }),
)

export const richTextArb: fc.Arbitrary<RichText> = fc.array(
  fc.array(spanArb, { maxLength: 3 }),
  { maxLength: 3 },
)

export const translatedRichTextArb: fc.Arbitrary<TranslatedRichText> = fc.record({
  ja: slotArb(richTextArb),
  en: slotArb(richTextArb),
})

const linkArb = fc.record({ id: idArb, url: fc.string(), text: fc.string() })
const linkListArb = fc.array(linkArb, { maxLength: 3 })

export const localizedLinksArb: fc.Arbitrary<LocalizedLinks> = fc.record({
  ja: slotArb(linkListArb),
  en: slotArb(linkListArb),
})

const numberValueArb: fc.Arbitrary<NumberValue> = fc.record({
  label: fc.option(fc.string(), { nil: null }),
  value: fc.double({ noNaN: true, noDefaultInfinity: true }),
  unit: fc.option(fc.string(), { nil: null }),
  inputValue: fc.double({ noNaN: true, noDefaultInfinity: true }),
  inputUnit: fc.option(fc.string(), { nil: null }),
  note: fc.option(fc.string(), { nil: null }),
})

export const contentValueArb: fc.Arbitrary<ContentValue> = fc.oneof(
  fc.record({ kind: fc.constant("text" as const), text: translatedRichTextArb }),
  fc.record({ kind: fc.constant("single" as const), value: slotArb(fc.string()) }),
  fc.record({ kind: fc.constant("accession" as const), value: slotArb(fc.string()) }),
  fc.record({
    kind: fc.constant("vocabulary" as const),
    termIds: slotArb(fc.array(idArb, { maxLength: 3 })),
  }),
  fc.record({
    kind: fc.constant("number" as const),
    values: slotArb(fc.array(numberValueArb, { minLength: 1, maxLength: 3 })),
  }),
)

export const valueSlotArb: fc.Arbitrary<ValueSlot> = fc.record({
  keyId: keyIdArb,
  value: contentValueArb,
})

export const experimentArb: fc.Arbitrary<Experiment> = fc.record({
  id: idArb,
  label: slotArb(fc.string()),
  values: fc.array(valueSlotArb, { maxLength: 4 }),
})

export const researchContentArb: fc.Arbitrary<ResearchContent> = fc.record({
  title: translatedTextArb,
  summary: fc.record({
    aims: translatedRichTextArb,
    methods: translatedRichTextArb,
    targets: translatedRichTextArb,
    url: localizedLinksArb,
  }),
  listingSummary: fc.record({
    methods: translatedRichTextArb,
    targets: translatedRichTextArb,
    typeOfData: translatedRichTextArb,
  }),
  releaseNote: translatedRichTextArb,
  dataProviders: fc.array(
    fc.record({
      id: idArb,
      name: translatedTextArb,
      organization: fc.record({
        name: translatedTextArb,
        address: translatedTextArb,
      }),
      orcid: slotArb(fc.string()),
      email: slotArb(fc.string()),
    }),
    { maxLength: 3 },
  ),
  researchProjects: fc.array(
    fc.record({ id: idArb, name: translatedTextArb, url: localizedLinksArb }),
    { maxLength: 3 },
  ),
  grants: fc.array(
    fc.record({
      id: idArb,
      title: translatedTextArb,
      agency: fc.record({ name: translatedTextArb }),
      grantIds: fc.array(fc.string(), { maxLength: 3 }),
    }),
    { maxLength: 3 },
  ),
  relatedPublications: fc.array(
    fc.record({
      id: idArb,
      title: slotArb(fc.string()),
      doi: slotArb(fc.string()),
      datasetIds: fc.array(idArb, { maxLength: 3 }),
    }),
    { maxLength: 3 },
  ),
  datasetIds: fc.array(idArb, { maxLength: 4 }),
})

export const datasetContentArb: fc.Arbitrary<DatasetContent> = fc.record({
  releaseDate: dateArb,
  fileSelection: fc.array(fileNameArb, { maxLength: 4 }),
  values: fc.array(valueSlotArb, { maxLength: 4 }),
  experiments: fc.array(experimentArb, { maxLength: 3 }),
})

/** A catalog that knows some of the key ids and shows some of those. */
export const catalogArb: fc.Arbitrary<ReadonlyMap<string, CatalogKey>> = fc
  .array(fc.record({ id: keyIdArb, showOnPublicPage: fc.boolean() }), { maxLength: 4 })
  .map((keys) => new Map(keys.map((key) => [key.id, key])))

export const filesArb: fc.Arbitrary<StoredFile[]> = fc.array(
  fc.record({ name: fileNameArb, size: fc.nat() }),
  { maxLength: 4 },
)
