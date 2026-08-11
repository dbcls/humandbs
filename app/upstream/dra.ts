/**
 * Reading a DRA submission into the experiments a draft would hold.
 *
 * The pure half of that source: what one experiment entry says, and how a
 * submission's experiments fold into the handful of rows a curator writes. The
 * requests are in `dra.server.ts`.
 *
 * **A submission's experiments are folded by library strategy.** DRA holds one
 * experiment per library — a submission has dozens to hundreds of them — while
 * an experiment here is one table of an article, and a published dataset carries
 * one of those four times out of five. The strategy is what the article's tables
 * are divided by, so it is what these are divided by
 * (docs/editing.md の「上流からの下書き」).
 */

import type { SraEntry } from "./ddbj-search.server"

/** One library, as DDBJ Search describes it. */
export interface DraExperiment {
  /** The INSDC library strategy, spelled as upstream spells it. */
  strategy: string
  instrumentModels: string[]
  /** `PAIRED` or `SINGLE`, spelled as upstream spells it. */
  layout: string | null
  /** Bases in one read. */
  readLength: number | null
}

/** The libraries of one strategy, as one experiment of a draft. */
export interface DraExperimentGroup {
  strategy: string
  instrumentModels: string[]
  layout: string | null
  readLength: number | null
}

function stringsOf(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter((value) => value !== "")
}

function at(value: unknown, path: readonly string[]): unknown {
  let here = value
  for (const step of path) {
    if (here === null || typeof here !== "object") return undefined
    here = (here as Record<string, unknown>)[step]
  }
  return here
}

const SPOT_LENGTH = [
  "EXPERIMENT_SET", "EXPERIMENT", "DESIGN", "SPOT_DESCRIPTOR", "SPOT_DECODE_SPEC", "SPOT_LENGTH",
] as const

/**
 * The length of one read.
 *
 * The submitted XML states the length of a spot, which spans both reads of a
 * paired library and one read of a single one — so the paired figure is halved
 * to get what the catalog's key means. A layout that is neither leaves it
 * unanswered rather than guessed at.
 */
export function readLengthOf(entry: SraEntry, layout: string | null): number | null {
  const stated = at(entry.properties, SPOT_LENGTH)
  const spot = typeof stated === "string" ? Number.parseInt(stated, 10) : NaN
  if (!Number.isFinite(spot) || spot <= 0) return null
  if (layout === "PAIRED") return spot >= 2 ? Math.floor(spot / 2) : null
  return layout === "SINGLE" ? spot : null
}

export function experimentOf(entry: SraEntry): DraExperiment {
  const layout = entry.libraryLayout?.trim().toUpperCase() ?? ""
  const known = layout === "PAIRED" || layout === "SINGLE" ? layout : null
  return {
    strategy: stringsOf(entry.libraryStrategy)[0] ?? "",
    instrumentModels: stringsOf(entry.instrumentModel),
    layout: known,
    readLength: readLengthOf(entry, known),
  }
}

/**
 * One group per strategy, in the order the strategies were first seen.
 *
 * A value the group's libraries disagree about is dropped rather than reduced to
 * one of them: the catalog holds one layout and one read length per experiment,
 * and a draft that stated the first library's would be stating something no
 * table of the article says. Instrument models are kept in full, because that
 * key takes more than one.
 */
export function groupByStrategy(experiments: readonly DraExperiment[]): DraExperimentGroup[] {
  const groups = new Map<string, DraExperiment[]>()
  for (const experiment of experiments) {
    const held = groups.get(experiment.strategy)
    if (held === undefined) groups.set(experiment.strategy, [experiment])
    else held.push(experiment)
  }

  return [...groups].map(([strategy, members]) => ({
    strategy,
    instrumentModels: [...new Set(members.flatMap((member) => member.instrumentModels))].sort(),
    layout: agreed(members.map((member) => member.layout)),
    readLength: agreed(members.map((member) => member.readLength)),
  }))
}

/** The value they all state, when the ones that state anything state the same. */
function agreed<T>(values: readonly (T | null)[]): T | null {
  const stated = [...new Set(values.filter((value) => value !== null))]
  return stated.length === 1 ? stated[0] ?? null : null
}
