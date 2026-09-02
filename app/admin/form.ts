/**
 * The shape a research is edited in.
 *
 * It is not the content type. Two things differ, and both of them are about the
 * editor rather than about the model:
 *
 * - **prose is markdown here.** The tree is what is stored; markdown is what a
 *   person types. The trip out is `toMarkdown`, the trip back is the save-time
 *   parser, and a construct the tree cannot hold is refused there
 * - **a slot keeps its text whatever its state is.** Marking a field unsettled
 *   must not eat what was half typed into it, so the editor holds the state and
 *   the text side by side and the text is dropped only when the form is turned
 *   back into content
 *
 * **Every field has a path**, written the same way here, in the conflict diff
 * and in a comment's anchor. Array elements are addressed by their identity
 * (`dataProviders.{id}.name`) rather than by position, because reordering must
 * not move what points at them. The array's own path (`dataProviders`) is
 * membership and order.
 */

import { toMarkdown } from "~/content/richtext"
import type {
  Link,
  LocalizedLinks,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

export type SlotState = "value" | "unknown" | "not-applicable"

/** One editable side of a value. `text` survives a change of state. */
export interface TextInput {
  state: SlotState
  text: string
}

export interface LinkInput {
  id: string
  url: string
  text: string
}

export interface LinksInput {
  state: SlotState
  links: LinkInput[]
}

/**
 * Both languages of a field, each with its own state — a title can be settled
 * in Japanese while the English side is still a question put to the provider.
 */
export interface TextPairInput {
  ja: TextInput
  en: TextInput
}

export interface LinksPairInput {
  ja: LinksInput
  en: LinksInput
}

export interface DataProviderInput {
  id: string
  name: TextPairInput
  organization: { name: TextPairInput, address: TextPairInput }
  orcid: TextInput
  email: TextInput
}

export interface ResearchProjectInput {
  id: string
  name: TextPairInput
  url: LinksPairInput
}

export interface GrantInput {
  id: string
  title: TextPairInput
  agency: { name: TextPairInput }
  grantIds: string[]
}

export interface RelatedPublicationInput {
  id: string
  title: TextInput
  doi: TextInput
  datasetIds: string[]
}

export interface ResearchContentInput {
  title: TextPairInput
  summary: {
    aims: TextPairInput
    methods: TextPairInput
    targets: TextPairInput
    url: LinksPairInput
  }
  listingSummary: {
    methods: TextPairInput
    targets: TextPairInput
    typeOfData: TextPairInput
  }
  releaseNote: TextPairInput
  dataProviders: DataProviderInput[]
  researchProjects: ResearchProjectInput[]
  grants: GrantInput[]
  relatedPublications: RelatedPublicationInput[]
  datasetIds: string[]
}

/** What one save carries: the draft's memo and the content being edited. */
export interface DraftInput {
  note: string
  content: ResearchContentInput
}

function textInput(slot: Slot<string>): TextInput {
  return slot.state === "value" ? { state: "value", text: slot.value } : { state: slot.state, text: "" }
}

function proseInput(slot: Slot<RichText>): TextInput {
  return slot.state === "value"
    ? { state: "value", text: toMarkdown(slot.value) }
    : { state: slot.state, text: "" }
}

function linksInput(slot: Slot<Link[]>): LinksInput {
  return slot.state === "value"
    ? { state: "value", links: slot.value.map((link) => ({ ...link })) }
    : { state: slot.state, links: [] }
}

function textPair(pair: TranslatedText): TextPairInput {
  return { ja: textInput(pair.ja), en: textInput(pair.en) }
}

function prosePair(pair: TranslatedRichText): TextPairInput {
  return { ja: proseInput(pair.ja), en: proseInput(pair.en) }
}

function linksPair(pair: LocalizedLinks): LinksPairInput {
  return { ja: linksInput(pair.ja), en: linksInput(pair.en) }
}

/** What the editing screen is handed. Total, and the same for every state. */
export function researchContentInput(content: ResearchContent): ResearchContentInput {
  return {
    title: textPair(content.title),
    summary: {
      aims: prosePair(content.summary.aims),
      methods: prosePair(content.summary.methods),
      targets: prosePair(content.summary.targets),
      url: linksPair(content.summary.url),
    },
    listingSummary: {
      methods: prosePair(content.listingSummary.methods),
      targets: prosePair(content.listingSummary.targets),
      typeOfData: prosePair(content.listingSummary.typeOfData),
    },
    releaseNote: prosePair(content.releaseNote),
    dataProviders: content.dataProviders.map((provider) => ({
      id: provider.id,
      name: textPair(provider.name),
      organization: {
        name: textPair(provider.organization.name),
        address: textPair(provider.organization.address),
      },
      orcid: textInput(provider.orcid),
      email: textInput(provider.email),
    })),
    researchProjects: content.researchProjects.map((project) => ({
      id: project.id,
      name: textPair(project.name),
      url: linksPair(project.url),
    })),
    grants: content.grants.map((grant) => ({
      id: grant.id,
      title: textPair(grant.title),
      agency: { name: textPair(grant.agency.name) },
      grantIds: [...grant.grantIds],
    })),
    relatedPublications: content.relatedPublications.map((publication) => ({
      id: publication.id,
      title: textInput(publication.title),
      doi: textInput(publication.doi),
      datasetIds: [...publication.datasetIds],
    })),
    datasetIds: [...content.datasetIds],
  }
}
