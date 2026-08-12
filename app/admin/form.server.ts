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

import { parseRichText, type RichTextSyntax } from "~/content/parse.server"
import type {
  Link,
  LocalizedLinks,
  ResearchContent,
  RichText,
  Slot,
  TranslatedRichText,
  TranslatedText,
} from "~/content/types"

import type {
  LinksPairInput,
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
  summaryShort: z.object({
    methods: textPairSchema,
    targets: textPairSchema,
    typeOfData: textPairSchema,
  }),
  releaseNote: textPairSchema,
  dataProviders: elements(z.object({
    id: z.string().min(1),
    name: textPairSchema,
    organization: z.object({ name: textPairSchema, address: textPairSchema }),
    orcid: textInputSchema,
    email: textInputSchema,
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
  })),
  datasetIds: z.array(z.uuid()),
})

/** What one save carries. The revision is what the update is checked against. */
export const saveDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
  note: z.string(),
  content: researchContentInputSchema,
})

export type SaveDraftPayload = z.infer<typeof saveDraftSchema>

export interface FieldProblem {
  /** The path of the field the construct was written in (`form.ts`). */
  path: string
  syntax: RichTextSyntax
  line: number
}

export type ContentResult
  = | { ok: true, content: ResearchContent }
    | { ok: false, problems: FieldProblem[] }

/** Whatever was typed is dropped once the state says there is no value. */
export function textSlot(input: TextInput): Slot<string> {
  return input.state === "value" ? { state: "value", value: input.text } : { state: input.state }
}

function textPair(pair: TextPairInput): TranslatedText {
  return { ja: textSlot(pair.ja), en: textSlot(pair.en) }
}

function linksPair(pair: LinksPairInput): LocalizedLinks {
  const side = (input: LinksPairInput["ja"]): Slot<Link[]> =>
    input.state === "value"
      ? { state: "value", value: input.links.map((link) => ({ ...link })) }
      : { state: input.state }
  return { ja: side(pair.ja), en: side(pair.en) }
}

/**
 * Prose, and the problems it held. The language is part of the path so that a
 * table written into the English side is reported against the English side.
 */
export function prosePair(
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

export function researchContentOf(input: ResearchContentInput): ContentResult {
  const problems: FieldProblem[] = []
  const prose = (pair: TextPairInput, path: string) => prosePair(pair, path, problems)

  const content: ResearchContent = {
    title: textPair(input.title),
    summary: {
      aims: prose(input.summary.aims, "summary.aims"),
      methods: prose(input.summary.methods, "summary.methods"),
      targets: prose(input.summary.targets, "summary.targets"),
      url: linksPair(input.summary.url),
    },
    summaryShort: {
      methods: prose(input.summaryShort.methods, "summaryShort.methods"),
      targets: prose(input.summaryShort.targets, "summaryShort.targets"),
      typeOfData: prose(input.summaryShort.typeOfData, "summaryShort.typeOfData"),
    },
    releaseNote: prose(input.releaseNote, "releaseNote"),
    dataProviders: input.dataProviders.map((provider) => ({
      id: provider.id,
      name: textPair(provider.name),
      organization: {
        name: textPair(provider.organization.name),
        address: textPair(provider.organization.address),
      },
      orcid: textSlot(provider.orcid),
      email: textSlot(provider.email),
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
    })),
    datasetIds: [...input.datasetIds],
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, content }
}
