/**
 * What a research or a dataset is still missing, as far as its content can say.
 *
 * Two readers, one walk. The management listing only wants to know whether
 * anything is missing, and the publish gate wants to list what — deriving those
 * separately would be two statements of one rule, so the walk collects the
 * places and the booleans are read off the result.
 *
 * Whether a hum label has been pinned is not here: it is read off the ledger
 * rather than the content. Anything that needs the upstream cache to answer
 * ("the pins disagree with the application system") belongs to the gate, where
 * the answer decides something.
 *
 * **This says nothing about whether a research may be published.** A draft is
 * expected to be incomplete; these are a work list, not a gate.
 */

import { isEmptyRichText } from "~/content/richtext"
import type {
  ContentValue,
  DatasetContent,
  Link,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

export type Language = "ja" | "en"

/**
 * What one language of one field amounts to. `empty` is not a state a slot can
 * be in — it is a value that holds nothing — and keeping it apart from
 * `unknown` is the whole point: one means nobody has started, the other means
 * somebody is waiting for an answer.
 */
type Presence = "unknown" | "not-applicable" | "empty" | "filled"

/** A value somebody marked as not yet settled. */
export interface UnsettledField {
  /** In the path vocabulary the editor and the conflict diff share. */
  path: string
  /** Null for a field that is not language-scoped. */
  language: Language | null
}

/** A translated pair holding a value in one language and nothing in the other. */
export interface UntranslatedField {
  path: string
  missing: Language
}

export interface ContentProblems {
  unsettled: UnsettledField[]
  untranslated: UntranslatedField[]
}

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
 * Collecting as it walks.
 *
 * A pair is looked at twice over: each language can be unsettled on its own,
 * and only a pair can be untranslated. The two never both fire for one language
 * of one field — untranslated needs both sides to hold a value, and a side that
 * is unsettled holds none — so one missing value is never listed twice.
 */
class Walk {
  readonly unsettled: UnsettledField[] = []
  readonly untranslated: UntranslatedField[] = []

  slot(path: string, value: Presence, language: Language | null = null): void {
    if (value === "unknown") this.unsettled.push({ path, language })
  }

  /** A pair of languages that are two renderings of one thing. */
  pair(path: string, ja: Presence, en: Presence): void {
    this.slot(path, ja, "ja")
    this.slot(path, en, "en")
    if (ja === "filled" && en === "empty") this.untranslated.push({ path, missing: "en" })
    if (ja === "empty" && en === "filled") this.untranslated.push({ path, missing: "ja" })
  }

  text(path: string, pair: TranslatedText): void {
    this.pair(path, ofText(pair.ja), ofText(pair.en))
  }

  rich(path: string, pair: TranslatedRichText): void {
    this.pair(path, ofRich(pair.ja), ofRich(pair.en))
  }

  /**
   * A URL pair is not translated: the two languages point at different pages,
   * and a lab with no English page is not a lab whose English page is missing.
   */
  links(path: string, pair: { ja: Slot<Link[]>, en: Slot<Link[]> }): void {
    this.slot(path, ofLinks(pair.ja), "ja")
    this.slot(path, ofLinks(pair.en), "en")
  }

  /** A value under a catalog key. Which of the five shapes it is decides how. */
  value(path: string, value: ContentValue): void {
    if (value.kind === "text") {
      this.rich(path, value.text)
    } else if (value.kind === "vocabulary") {
      this.slot(path, presence(value.termIds, (ids) => ids.length === 0))
    } else if (value.kind === "number") {
      this.slot(path, presence(value.value, () => false))
    } else {
      this.slot(path, ofText(value.value))
    }
  }

  get problems(): ContentProblems {
    return { unsettled: this.unsettled, untranslated: this.untranslated }
  }
}

export function researchProblems(content: ResearchContent): ContentProblems {
  const walk = new Walk()

  walk.text("title", content.title)
  walk.rich("summary.aims", content.summary.aims)
  walk.rich("summary.methods", content.summary.methods)
  walk.rich("summary.targets", content.summary.targets)
  walk.links("summary.url", content.summary.url)
  walk.rich("summaryShort.methods", content.summaryShort.methods)
  walk.rich("summaryShort.targets", content.summaryShort.targets)
  walk.rich("summaryShort.typeOfData", content.summaryShort.typeOfData)
  walk.rich("releaseNote", content.releaseNote)

  for (const provider of content.dataProviders) {
    const at = `dataProviders.${provider.id}`
    walk.text(`${at}.name`, provider.name)
    walk.text(`${at}.organization.name`, provider.organization.name)
    walk.text(`${at}.organization.address`, provider.organization.address)
    walk.slot(`${at}.orcid`, ofText(provider.orcid))
    walk.slot(`${at}.email`, ofText(provider.email))
  }
  for (const project of content.researchProjects) {
    const at = `researchProjects.${project.id}`
    walk.text(`${at}.name`, project.name)
    walk.links(`${at}.url`, project.url)
  }
  for (const grant of content.grants) {
    const at = `grants.${grant.id}`
    walk.text(`${at}.title`, grant.title)
    walk.text(`${at}.agency.name`, grant.agency.name)
  }
  for (const publication of content.relatedPublications) {
    const at = `relatedPublications.${publication.id}`
    walk.slot(`${at}.title`, ofText(publication.title))
    walk.slot(`${at}.doi`, ofText(publication.doi))
  }

  return walk.problems
}

/**
 * The same walk over a dataset. A value slot is addressed by the catalog key it
 * is under and an experiment by its identity, which is how the editor, the
 * conflict diff and a comment all spell them.
 */
export function datasetProblems(content: DatasetContent): ContentProblems {
  const walk = new Walk()

  for (const slot of content.values) {
    walk.value(`values.${slot.keyId}`, slot.value)
  }
  for (const experiment of content.experiments) {
    const at = `experiments.${experiment.id}`
    walk.slot(`${at}.label`, ofText(experiment.label))
    for (const slot of experiment.values) {
      walk.value(`${at}.values.${slot.keyId}`, slot.value)
    }
  }

  return walk.problems
}

export function contentFlags(content: ResearchContent): ContentFlags {
  return flagsOf(researchProblems(content))
}

export function flagsOf(problems: ContentProblems): ContentFlags {
  return {
    unsettled: problems.unsettled.length > 0,
    untranslated: problems.untranslated.length > 0,
  }
}
