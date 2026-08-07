/**
 * What a research is still missing, as far as its content can say.
 *
 * The management listing filters on three of these. Two are read off the
 * content and live here; the third — whether a hum label has been pinned — is
 * read off the ledger, because it is not content. Anything that needs the
 * upstream cache to answer ("the pins disagree with the application system")
 * belongs to the publish gate instead, where the answer decides something.
 *
 * **This says nothing about whether a research may be published.** A draft is
 * expected to be incomplete; these are a work list, not a gate.
 */

import { isEmptyRichText } from "~/content/richtext"
import type {
  Link,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

/**
 * What one language of one field amounts to. `empty` is not a state a slot can
 * be in — it is a value that holds nothing — and keeping it apart from
 * `unknown` is the whole point: one means nobody has started, the other means
 * somebody is waiting for an answer.
 */
type Presence = "unknown" | "not-applicable" | "empty" | "filled"

export interface ContentFlags {
  /** Some value is marked as not yet settled. */
  unsettled: boolean
  /** Some translated pair holds a value in one language and nothing in the other. */
  untranslated: boolean
}

function presence<T>(slot: Slot<T>, empty: (value: T) => boolean): Presence {
  if (slot.state === "unknown") return "unknown"
  if (slot.state === "not-applicable") return "not-applicable"
  return empty(slot.value) ? "empty" : "filled"
}

function ofText(slot: Slot<string>): Presence {
  return presence(slot, (value) => value === "")
}

function ofRich(slot: Slot<RichText>): Presence {
  return presence(slot, isEmptyRichText)
}

function ofLinks(slot: Slot<Link[]>): Presence {
  return presence(slot, (links) => links.length === 0)
}

/**
 * Collecting as it walks. Translated pairs go into both lists: every slot is
 * looked at for `unsettled`, and only a pair can be untranslated.
 */
class Walk {
  readonly all: Presence[] = []
  readonly pairs: [Presence, Presence][] = []

  slot(value: Presence): void {
    this.all.push(value)
  }

  /** A pair of languages that are two renderings of one thing. */
  pair(ja: Presence, en: Presence): void {
    this.all.push(ja, en)
    this.pairs.push([ja, en])
  }

  text(pair: TranslatedText): void {
    this.pair(ofText(pair.ja), ofText(pair.en))
  }

  rich(pair: TranslatedRichText): void {
    this.pair(ofRich(pair.ja), ofRich(pair.en))
  }
}

/**
 * A URL pair is not translated: the two languages point at different pages, and
 * a lab with no English page is not a lab whose English page is missing.
 */
function links(walk: Walk, pair: { ja: Slot<Link[]>, en: Slot<Link[]> }): void {
  walk.slot(ofLinks(pair.ja))
  walk.slot(ofLinks(pair.en))
}

function untranslated(pairs: readonly [Presence, Presence][]): boolean {
  return pairs.some(([ja, en]) =>
    (ja === "filled" && en === "empty") || (ja === "empty" && en === "filled"))
}

export function contentFlags(content: ResearchContent): ContentFlags {
  const walk = new Walk()

  walk.text(content.title)
  walk.rich(content.summary.aims)
  walk.rich(content.summary.methods)
  walk.rich(content.summary.targets)
  links(walk, content.summary.url)
  walk.rich(content.summaryShort.methods)
  walk.rich(content.summaryShort.targets)
  walk.rich(content.summaryShort.typeOfData)
  walk.rich(content.releaseNote)

  for (const provider of content.dataProviders) {
    walk.text(provider.name)
    walk.text(provider.organization.name)
    walk.text(provider.organization.address)
    walk.slot(ofText(provider.orcid))
    walk.slot(ofText(provider.email))
  }
  for (const project of content.researchProjects) {
    walk.text(project.name)
    links(walk, project.url)
  }
  for (const grant of content.grants) {
    walk.text(grant.title)
    walk.text(grant.agency.name)
  }
  for (const publication of content.relatedPublications) {
    walk.slot(ofText(publication.title))
    walk.slot(ofText(publication.doi))
  }

  return {
    unsettled: walk.all.includes("unknown"),
    untranslated: untranslated(walk.pairs),
  }
}
