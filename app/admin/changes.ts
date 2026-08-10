/**
 * Where a draft says something other than the version that is out there now.
 *
 * This is what the preview and the editing screens mark, and it answers a
 * different question from `merge.ts`: not "who changed what since we started",
 * but "what would a reader see change if this went out". So there is no base
 * and no three-way — the published version and the draft, compared with the
 * same functions the conflict band uses, reported as the same paths.
 *
 * A research with nothing published has nothing to compare against. That is not
 * "everything changed": a first version is all new by definition, and marking
 * every field would say nothing.
 */

import { diffDatasetInput } from "./dataset-diff"
import { datasetContentInput } from "./dataset-form"
import { diffDraftInput } from "./diff"
import { researchContentInput, type SlotState } from "./form"
import { readAt } from "./paths"

import type { DatasetContent, ResearchContent } from "~/content/types"

export function changedFromPublished(
  published: ResearchContent,
  draft: ResearchContent,
): string[] {
  return diffDraftInput(
    { note: "", content: researchContentInput(published) },
    { note: "", content: researchContentInput(draft) },
  )
}

export function changedDatasetFromPublished(
  published: DatasetContent,
  draft: DatasetContent,
): string[] {
  return diffDatasetInput(datasetContentInput(published), datasetContentInput(draft))
}

/**
 * A value of the editing form as something a screen can show.
 *
 * The editor marks where the published version says something else, and opening
 * the mark shows what it says. Reaching a value by its path means arriving at
 * one of a handful of shapes rather than at a known type, so this recognises
 * them and gives up on anything else — an array of elements, say, where the
 * difference is membership and the honest answer is the mark alone.
 */
export interface ShownLine {
  /** A language, or empty for a value that has none. */
  label: string
  state: SlotState
  text: string
  /** A vocabulary value: the screen has the catalog and resolves the labels. */
  termIds?: string[]
}

export function describeInput(value: unknown): ShownLine[] | null {
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string")
      ? [{ label: "", state: "value", text: value.join(", ") }]
      : null
  }
  if (!isRecord(value)) return null

  // A value slot, and then the body inside it.
  if (typeof value.keyId === "string" && isRecord(value.value)) return describeInput(value.value)
  if (value.kind === "text") return describeInput(value.text)

  if (isRecord(value.ja) && isRecord(value.en)) {
    const ja = lineOf("ja", value.ja)
    const en = lineOf("en", value.en)
    return ja === null || en === null ? null : [ja, en]
  }

  const one = lineOf("", value)
  return one === null ? null : [one]
}

/** The described value at a path, or null where there is nothing to show. */
export function describeAt(input: unknown, path: string): ShownLine[] | null {
  const found = readAt(input, path.split("."))
  return found.found ? describeInput(found.value) : null
}

function described(input: unknown, paths: readonly string[]): Record<string, ShownLine[]> {
  const held: Record<string, ShownLine[]> = {}
  for (const path of paths) {
    const lines = describeAt(input, path)
    if (lines !== null) held[path] = lines
  }
  return held
}

/** What the published version says at each of the paths that moved. */
export function describedResearch(
  published: ResearchContent,
  paths: readonly string[],
): Record<string, ShownLine[]> {
  return described(researchContentInput(published), paths)
}

export function describedDataset(
  published: DatasetContent,
  paths: readonly string[],
): Record<string, ShownLine[]> {
  return described(datasetContentInput(published), paths)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function lineOf(label: string, slot: Record<string, unknown>): ShownLine | null {
  const state = slot.state
  if (state !== "value" && state !== "unknown" && state !== "not-applicable") return null
  if (typeof slot.text === "string") return { label, state, text: slot.text }
  if (Array.isArray(slot.termIds)) {
    return { label, state, text: "", termIds: slot.termIds.filter((id) => typeof id === "string") }
  }
  if (Array.isArray(slot.links)) {
    const urls = slot.links.flatMap((link) =>
      isRecord(link) && typeof link.url === "string" ? [link.url] : [])
    return { label, state, text: urls.join("\n") }
  }
  return null
}
