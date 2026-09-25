/**
 * Turning what the editor sent back into content.
 *
 * Two things happen here and nowhere else. The payload is checked against a
 * schema before anything reads it — it arrives as JSON from a browser, and a
 * shape nobody validated would be written straight into a JSONB column. And
 * prose is parsed: markdown goes in, a tree comes out, and **a construct the
 * tree cannot hold stops the whole save** rather than being quietly dropped.
 *
 * The two failures are answered differently on purpose. A payload that does not
 * fit the schema is a fault in the client, so it is a 400 with nothing for the
 * author to do. A refused construct is something the author wrote, so it comes
 * back as a problem against the field it was written in, with the line, and the
 * form keeps everything that was typed.
 */

import { z } from "zod"

import { parseRichText } from "~/content/parse.server"
import type {
  Link,
  ListingProvider,
  LocalizedLinks,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

import type {
  LinksPairInput,
  ListingProviderInput,
  ResearchContentInput,
  TextInput,
  TextPairInput,
} from "./form"

/**
 * A slot means the same thing whichever form it was typed into, so its schema
 * and the two conversions below are exported for the dataset save path
 * (`dataset-form.server.ts`) rather than written out there again. Written
 * twice, they drift the first time one of them is corrected.
 */
export const slotState = z.enum(["value", "unknown", "not-applicable"])

export const textInputSchema = z.object({ state: slotState, text: z.string() })

const linkInputSchema = z.object({
  id: z.string().min(1),
  url: z.string(),
  text: z.string(),
})

const linksInputSchema = z.object({
  state: slotState,
  links: z.array(linkInputSchema).refine(distinctIds, "links need distinct identities"),
})

export const textPairSchema = z.object({ ja: textInputSchema, en: textInputSchema })
const linksPairSchema = z.object({ ja: linksInputSchema, en: linksInputSchema })

/**
 * An identity is what a comment points at and what the conflict diff lines up
 * two versions by, so two elements sharing one would make both ambiguous.
 */
function distinctIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length
}

function elements<T extends z.ZodType<{ id: string }>>(schema: T) {
  return z.array(schema).refine(distinctIds, "elements need distinct identities")
}

const researchContentInputSchema = z.object({
  title: textPairSchema,
  summary: z.object({
    aims: textPairSchema,
    methods: textPairSchema,
    targets: textPairSchema,
    url: linksPairSchema,
  }),
  listingSummary: z.object({
    methods: textPairSchema,
    targets: textPairSchema,
    typeOfData: textPairSchema,
    dataProviders: elements(z.object({
      id: z.string().min(1),
      name: textPairSchema,
    })),
  }),
  releaseNote: textPairSchema,
  dataProviders: elements(z.object({
    id: z.string().min(1),
    name: textPairSchema,
    organization: z.object({ name: textPairSchema }),
  })),
  researchProjects: elements(z.object({
    id: z.string().min(1),
    name: textPairSchema,
    url: linksPairSchema,
  })),
  grants: elements(z.object({
    id: z.string().min(1),
    title: textPairSchema,
    agency: z.object({ name: textPairSchema }),
    grantIds: z.array(z.string()),
  })),
  relatedPublications: elements(z.object({
    id: z.string().min(1),
    title: textInputSchema,
    doi: textInputSchema,
    datasetIds: z.array(z.uuid()),
    externalIds: z.array(z.string().max(64)).max(200),
  })),
  datasetIds: z.array(z.uuid()),
})

/** What one save contains. The revision is what the update is checked against. */
export const saveDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
  content: researchContentInputSchema,
})

/** Whatever was typed is dropped once the state indicates there is no value. */
export function textSlot(input: TextInput): Slot<string> {
  return input.state === "value" ? { state: "value", value: input.text } : { state: input.state }
}

function textPair(pair: TextPairInput): TranslatedText {
  return { ja: textSlot(pair.ja), en: textSlot(pair.en) }
}

/**
 * One name for the listing's provider column, or null where the element holds
 * nothing in either language and is not waiting on an answer either — a card
 * somebody added and left alone.
 *
 * **A blank one cannot be kept.** An empty list is how the column means "the
 * research's own providers" (`app/public/view.server.ts` の `listingProviders`),
 * so an element holding nothing would quietly replace those names with a blank
 * cell, and neither the publish check nor the form has anything to flag about a
 * field that is legitimately empty.
 */
function listingProvider(input: ListingProviderInput): ListingProvider | null {
  const name = textPair(input.name)
  const blank = (slot: Slot<string>) => slot.state === "value" && slot.value.trim() === ""
  return blank(name.ja) && blank(name.en) ? null : { id: input.id, name }
}

function linksPair(pair: LinksPairInput): LocalizedLinks {
  const side = (input: LinksPairInput["ja"]): Slot<Link[]> =>
    input.state === "value"
      ? { state: "value", value: input.links.map((link) => ({ ...link })) }
      : { state: input.state }
  return { ja: side(pair.ja), en: side(pair.en) }
}

/** Prose, one language at a time: what was typed, read into the tree it is stored as. */
export function prosePair(pair: TextPairInput): TranslatedRichText {
  const side = (input: TextInput): Slot<RichText> =>
    input.state === "value" ? { state: "value", value: parseRichText(input.text) } : { state: input.state }
  return { ja: side(pair.ja), en: side(pair.en) }
}

/**
 * The IDs typed into a publication's list as they are kept: each trimmed, the
 * blank rows the add button leaves dropped, and each written once.
 */
export function typedIds(typed: readonly string[]): string[] {
  return [...new Set(typed.map((id) => id.trim()).filter((id) => id !== ""))]
}

export function researchContentOf(input: ResearchContentInput): ResearchContent {
  const prose = (pair: TextPairInput) => prosePair(pair)

  const content: ResearchContent = {
    title: textPair(input.title),
    summary: {
      aims: prose(input.summary.aims),
      methods: prose(input.summary.methods),
      targets: prose(input.summary.targets),
      url: linksPair(input.summary.url),
    },
    listingSummary: {
      methods: prose(input.listingSummary.methods),
      targets: prose(input.listingSummary.targets),
      typeOfData: prose(input.listingSummary.typeOfData),
      dataProviders: input.listingSummary.dataProviders.flatMap((provider) => {
        const one = listingProvider(provider)
        return one === null ? [] : [one]
      }),
    },
    releaseNote: prose(input.releaseNote),
    dataProviders: input.dataProviders.map((provider) => ({
      id: provider.id,
      name: textPair(provider.name),
      organization: {
        name: textPair(provider.organization.name),
      },
    })),
    researchProjects: input.researchProjects.map((project) => ({
      id: project.id,
      name: textPair(project.name),
      url: linksPair(project.url),
    })),
    grants: input.grants.map((grant) => ({
      id: grant.id,
      title: textPair(grant.title),
      agency: { name: textPair(grant.agency.name) },
      grantIds: [...grant.grantIds],
    })),
    relatedPublications: input.relatedPublications.map((publication) => ({
      id: publication.id,
      title: textSlot(publication.title),
      doi: textSlot(publication.doi),
      datasetIds: [...publication.datasetIds],
      externalIds: typedIds(publication.externalIds),
    })),
    datasetIds: [...input.datasetIds],
  }

  return content
}
