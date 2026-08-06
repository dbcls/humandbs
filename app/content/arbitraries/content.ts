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
 */

import fc from "fast-check"

import type {
  ContentValue,
  DatasetContent,
  Experiment,
  LocalizedLinks,
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

export const translatedTextArb: fc.Arbitrary<TranslatedText> = fc.record({
  ja: fc.string(),
  en: fc.string(),
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
  ja: richTextArb,
  en: richTextArb,
})

const linkArb = fc.record({ id: idArb, url: fc.string(), text: fc.string() })

export const localizedLinksArb: fc.Arbitrary<LocalizedLinks> = fc.record({
  ja: fc.array(linkArb, { maxLength: 3 }),
  en: fc.array(linkArb, { maxLength: 3 }),
})

/** All three states, so that dropping one is visible and keeping two is checked. */
export function slotArb<T>(value: fc.Arbitrary<T>): fc.Arbitrary<Slot<T>> {
  return fc.oneof(
    fc.record({ state: fc.constant("value" as const), value }),
    fc.constant<Slot<T>>({ state: "unknown" }),
    fc.constant<Slot<T>>({ state: "not-applicable" }),
  )
}

export const contentValueArb: fc.Arbitrary<ContentValue> = fc.oneof(
  fc.record({ kind: fc.constant("text" as const), text: translatedRichTextArb }),
  fc.record({ kind: fc.constant("single" as const), value: fc.string() }),
  fc.record({ kind: fc.constant("accession" as const), value: fc.string() }),
  fc.record({
    kind: fc.constant("vocabulary" as const),
    termIds: fc.array(idArb, { maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant("number" as const),
    value: fc.double({ noNaN: true, noDefaultInfinity: true }),
    unit: fc.option(fc.string(), { nil: null }),
    inputValue: fc.double({ noNaN: true, noDefaultInfinity: true }),
    inputUnit: fc.option(fc.string(), { nil: null }),
  }),
)

export const valueSlotArb: fc.Arbitrary<ValueSlot> = fc.record({
  keyId: keyIdArb,
  slot: slotArb(contentValueArb),
})

export const experimentArb: fc.Arbitrary<Experiment> = fc.record({
  id: idArb,
  label: slotArb(fc.string()),
  values: fc.array(valueSlotArb, { maxLength: 4 }),
})

export const researchContentArb: fc.Arbitrary<ResearchContent> = fc.record({
  title: slotArb(translatedTextArb),
  summary: fc.record({
    aims: slotArb(translatedRichTextArb),
    methods: slotArb(translatedRichTextArb),
    targets: slotArb(translatedRichTextArb),
    url: slotArb(localizedLinksArb),
  }),
  summaryShort: fc.record({
    methods: slotArb(translatedRichTextArb),
    targets: slotArb(translatedRichTextArb),
    typeOfData: slotArb(translatedRichTextArb),
  }),
  releaseNote: slotArb(translatedRichTextArb),
  dataProviders: fc.array(
    fc.record({
      id: idArb,
      name: slotArb(translatedTextArb),
      organization: fc.record({
        name: slotArb(translatedTextArb),
        address: slotArb(translatedTextArb),
      }),
      orcid: slotArb(fc.string()),
      email: slotArb(fc.string()),
    }),
    { maxLength: 3 },
  ),
  researchProjects: fc.array(
    fc.record({ id: idArb, name: slotArb(translatedTextArb), url: slotArb(localizedLinksArb) }),
    { maxLength: 3 },
  ),
  grants: fc.array(
    fc.record({
      id: idArb,
      title: slotArb(translatedTextArb),
      agency: fc.record({ name: slotArb(translatedTextArb) }),
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
