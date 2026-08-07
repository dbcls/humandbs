/**
 * Generators for what the editing screen holds.
 *
 * Element identities are drawn from a positional pool rather than freely, so
 * that two independently generated drafts share some of them. Without that,
 * every element would look added-and-removed to the diff and the per-element
 * paths — the ones a comment will later point at — would never be exercised.
 */

import fc from "fast-check"

import { researchContentArb } from "~/content/arbitraries/content"
import type { ResearchContent } from "~/content/types"

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
