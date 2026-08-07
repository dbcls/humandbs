/**
 * The shape of everything stored as content.
 *
 * Content lives in JSONB columns, so these types are the only place that says
 * which fields are translated, which carry a single language-independent value,
 * and which hold a separate value per language. There is no second list of that
 * classification anywhere — a list would drift from the types.
 *
 * Published content and draft content use the same types. Publishing copies a
 * value; a three-way diff compares three values of one type.
 */

/**
 * The three states a value can be in. Together with a value that is present but
 * empty this makes four ways a field appears; a value slot adds a fifth by being
 * absent from the list altogether.
 *
 * `unknown` is what the publish gate enumerates: a value that should exist but
 * has not been settled. **Empty is a different thing** — nobody has touched it
 * yet, which is what a required-field check looks for. Emptiness is a value
 * rather than a state of its own, so that "the empty state" and "the empty
 * value" never become two ways of writing the same thing.
 *
 * `not-applicable` is settled information — the value does not exist — so the
 * gate leaves it alone and the public page renders it as an explicit "not
 * applicable" rather than hiding the row.
 */
export type Slot<T>
  = | { state: "value", value: T }
    | { state: "unknown" }
    | { state: "not-applicable" }

/**
 * A plain pair of languages, carrying no state.
 *
 * This is for what curators do not edit: the cache of an upstream system, whose
 * two languages are whatever upstream has, and site content, which has neither
 * versions nor pins. Neither is ever counted as untranslated.
 */
export interface Bilingual {
  ja: string
  en: string
}

/**
 * A translated pair. **Each language carries its own state**, because a field
 * can be settled in one language while still being a question in the other —
 * the published data has `ご教示ください(英語タイトル)` sitting in `en` while
 * `ja` holds a value.
 *
 * The state is held here and nowhere else. Wrapping the pair in a slot as well
 * would let one fact be stated in two places.
 *
 * Untranslated is derived rather than stored: both languages hold a value and
 * exactly one of them is empty. Where the states differ — a value on one side,
 * `unknown` on the other — it counts as unsettled instead, so one missing value
 * is never listed twice by the publish gate.
 */
export interface TranslatedText {
  ja: Slot<string>
  en: Slot<string>
}

/**
 * A run of text inside a line, and the whole of what may decorate one: a
 * destination. Nothing else is representable — no emphasis, no code, no
 * superscript, no raw HTML.
 *
 * `text` never contains a newline. A line break is a line, which is the only
 * thing the structure above a span says.
 */
export interface Span {
  text: string
  /** Present when the run is a link. */
  href?: string
}

export type Line = Span[]

/**
 * What a sentence is: lines of spans, and no other structure. An empty line
 * separates paragraphs; the empty rich text is `[]`.
 *
 * Prose is held this way rather than as markdown so that the set of things a
 * curator may write is the type itself. A markdown string says nothing about
 * its own contents until it is parsed, which puts the allowed set in two places
 * — the check at save time and the sanitiser at render time — and lets raw HTML
 * arrive on the portal's own origin. Input is still written as markdown and
 * parsed into this on the way in; output is this walked into plain text, into
 * markdown, or straight into the page.
 */
export type RichText = Line[]

/** A translated pair of prose. The state is per language, as above. */
export interface TranslatedRichText {
  ja: Slot<RichText>
  en: Slot<RichText>
}

/**
 * A value whose two languages point at different resources. In the real data
 * only URLs do this: a lab's Japanese page and its English page are separate
 * pages, and often only one exists.
 */
export interface LocalizedLinks {
  ja: Slot<Link[]>
  en: Slot<Link[]>
}

export interface Link {
  /** Stable across reordering, so a comment can address one link. */
  id: string
  url: string
  text: string
}

/** A number as stored: what search reads, and what was typed to get there. */
export interface NumberValue {
  /** Converted to the key's canonical unit. Search and facets read only this. */
  value: number
  unit: string | null
  /** What the editor actually typed, kept so a bad conversion can be redone. */
  inputValue: number
  inputUnit: string | null
}

/**
 * A value under a catalog key. The `kind` mirrors `content_key.value_type`, so
 * a value carries enough to be rendered without reading the catalog, and
 * writing one whose kind disagrees with its key is rejected at the write path.
 *
 * **The state sits inside**: translated prose holds one per language,
 * everything else holds one. Putting a state on the slot as well would be a
 * second place to say the same thing.
 */
export type ContentValue
  = | { kind: "text", text: TranslatedRichText }
    | { kind: "single", value: Slot<string> }
    | { kind: "accession", value: Slot<string> }
    | { kind: "vocabulary", termIds: Slot<string[]> }
    | { kind: "number", value: Slot<NumberValue> }

export interface ValueSlot {
  /** References `content_key.id`. */
  keyId: string
  value: ContentValue
}

/** What a ContentSnapshot holds, and what a draft edits. */
export interface ResearchContent {
  title: TranslatedText
  summary: {
    aims: TranslatedRichText
    methods: TranslatedRichText
    targets: TranslatedRichText
    url: LocalizedLinks
  }
  summaryShort: {
    methods: TranslatedRichText
    targets: TranslatedRichText
    typeOfData: TranslatedRichText
  }
  releaseNote: TranslatedRichText
  dataProviders: DataProvider[]
  researchProjects: ResearchProject[]
  grants: Grant[]
  relatedPublications: RelatedPublication[]
  /**
   * Dataset identities, ordered. This is the whole of what a version pins:
   * opening an old version lists the datasets of that time, each described as
   * it is described now.
   */
  datasetIds: string[]
}

/** Array elements carry an identity because comments address them. */
export interface DataProvider {
  id: string
  name: TranslatedText
  organization: {
    name: TranslatedText
    address: TranslatedText
  }
  orcid: Slot<string>
  email: Slot<string>
}

export interface ResearchProject {
  id: string
  name: TranslatedText
  url: LocalizedLinks
}

export interface Grant {
  id: string
  title: TranslatedText
  agency: { name: TranslatedText }
  /** Grant numbers as issued. Not translated. */
  grantIds: string[]
}

export interface RelatedPublication {
  id: string
  /**
   * Single-valued: a paper has one title. 98% of the published data already has
   * ja and en byte-identical here.
   */
  title: Slot<string>
  doi: Slot<string>
  /** Dataset identities this publication covers. */
  datasetIds: string[]
}

/**
 * What a dataset holds. There is no version and no history — the archived data
 * itself does not change, only its description does, so the current description
 * is the right one for every version that points at the dataset.
 */
export interface DatasetContent {
  /**
   * Only NHA IDs carry a date here. Dates for external accessions come from the
   * archive cache, so storing one would be a second source for the same fact.
   */
  releaseDate: string | null
  /**
   * An ordered selection over the nodes the research's bucket lists. A note on
   * top of that listing, not a claim that the files exist: the listing is the
   * only source, so a selection pointing at something absent renders as nothing.
   */
  fileSelection: string[]
  /** Values under keys scoped to the dataset (access criteria, type of data). */
  values: ValueSlot[]
  experiments: Experiment[]
}

export interface Experiment {
  id: string
  /**
   * Free text taken from the line above the table in the source article. It is
   * a display label, not a controlled term — the facet vocabulary lives in
   * `values` under a catalog key.
   */
  label: Slot<string>
  /** Values under keys scoped to an experiment. */
  values: ValueSlot[]
}

/** One locale of a document or news item. These have no versions and no pins. */
export interface ArticleContent {
  title: string
  /** Markdown. */
  body: string
}

export interface AlertContent {
  /** Markdown. */
  body: Bilingual
}

/**
 * Where a comment is attached. Field-level and slot-level only; there are no
 * text ranges. Array elements are addressed by their identity, so reordering
 * does not move a comment.
 */
export type CommentAnchor
  = | { kind: "research-field", path: string }
    | { kind: "dataset-value", datasetId: string, keyId: string }
    | { kind: "experiment-value", datasetId: string, experimentId: string, keyId: string }

/** One entry of a draft's undo stack: the whole draft, not a diff. */
export interface DraftSnapshot {
  content: ResearchContent
  datasetEntries: { datasetId: string, content: DatasetContent }[]
}
