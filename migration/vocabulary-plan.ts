/**
 * The vocabularies as they were settled by hand, and the corrections to the
 * values the language model read.
 *
 * The development load mints a term for every value v1's reading holds
 * (`facets.ts`); the production load replaces those terms, set by set, with a
 * list written by reading the values against the articles. Per set there are
 * up to three tables under `hand/vocabulary/`:
 *
 * - `<set>-terms.tsv`: the terms the set holds (`code`, `label_en`, `label_ja`,
 *   `maker`, and `document`: the slug of the article a term links to, such as
 *   the text of a data use policy)
 * - `<set>-map.tsv`: where each term the reading mints goes (`from_code` →
 *   `to_codes`): one term, several (a value that named two things), or `-` for
 *   none (a value that is not a value of the set). `(空)` is the empty code
 * - `<set>-fixes.tsv`: terms to add to or remove from one experiment, where the
 *   article states a value the reading missed or got wrong (`hum`,
 *   `dataset_id`, `experiment_header`, `add_codes`, `remove_codes`). The
 *   dataset is named by the ID v1 gave it (`hum0014.v1.freq.v1`), not by the
 *   NHA id it is given, since those are numbered by the whole input and move
 *   when a dataset is added. The heading is the experiment's label, followed by
 *   ` [experiment-N]` where one dataset has more than one experiment of that label
 *
 * **A table that does not match the input stops the load**: a term the reading
 * mints that the map does not place, a code that is not in the set's terms, a
 * fix that lands on no experiment. Each was written against the input, and not
 * matching means one of the two has moved.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import type { DatasetContent, ValueSlot } from "~/content/types"

export interface PlannedTerm {
  code: string
  labelEn: string
  labelJa: string | null
  maker: string | null
  /** The slug of the article the term links to. */
  document: string | null
}

export interface VocabularyFix {
  setCode: string
  hum: string
  datasetId: string
  header: string
  add: string[]
  remove: string[]
}

export interface VocabularyPlan {
  /** The terms of each set the plan covers, in the order they were written. */
  terms: Map<string, PlannedTerm[]>
  /** Per set, where each code the reading mints goes. An empty list drops it. */
  map: Map<string, Map<string, string[]>>
  fixes: VocabularyFix[]
}

const EMPTY_CODE = "(空)"

function rowsOf(tsv: string): Record<string, string>[] {
  const [head, ...lines] = tsv.split("\n").filter((line) => line.trim() !== "")
  if (head === undefined) return []
  const names = head.split("\t")
  return lines.map((line) => {
    const cells = line.split("\t")
    return Object.fromEntries(names.map((name, i) => [name, (cells[i] ?? "").trim()]))
  })
}

const blankAsNull = (cell: string | undefined): string | null => cell === undefined || cell === "" ? null : cell

const codesIn = (cell: string | undefined): string[] =>
  (cell ?? "").split(",").map((code) => code.trim()).filter((code) => code !== "")

/** Reads the tables from the text of each file, keyed by file name. */
export function vocabularyPlanOf(files: ReadonlyMap<string, string>): VocabularyPlan {
  const terms = new Map<string, PlannedTerm[]>()
  const map = new Map<string, Map<string, string[]>>()
  const fixes: VocabularyFix[] = []
  for (const [name, text] of files) {
    const matched = /^(.+)-(terms|map|fixes)\.tsv$/.exec(name)
    if (matched === null) continue
    const setCode = matched[1] ?? ""
    const rows = rowsOf(text)
    if (matched[2] === "terms") {
      terms.set(setCode, rows.map((row) => ({
        code: row.code ?? "",
        labelEn: row.label_en ?? "",
        labelJa: blankAsNull(row.label_ja),
        maker: blankAsNull(row.maker),
        document: blankAsNull(row.document),
      })))
    } else if (matched[2] === "map") {
      map.set(setCode, new Map(rows.map((row) => [
        row.from_code === EMPTY_CODE ? "" : row.from_code ?? "",
        row.to_codes === "-" ? [] : codesIn(row.to_codes),
      ])))
    } else {
      fixes.push(...rows.map((row) => ({
        setCode,
        hum: row.hum ?? "",
        datasetId: row.dataset_id ?? "",
        header: row.experiment_header ?? "",
        add: codesIn(row.add_codes),
        remove: codesIn(row.remove_codes),
      })))
    }
  }
  const unknown: string[] = []
  for (const [setCode, targets] of map) {
    const known = new Set((terms.get(setCode) ?? []).map((term) => term.code))
    if (!terms.has(setCode)) unknown.push(`${setCode}: a map with no terms`)
    for (const [from, to] of targets) {
      for (const code of to) if (!known.has(code)) unknown.push(`${setCode}: ${from} → ${code}`)
    }
  }
  for (const fix of fixes) {
    const known = terms.get(fix.setCode)
    if (known === undefined) continue
    for (const code of [...fix.add, ...fix.remove]) {
      if (!known.some((term) => term.code === code)) unknown.push(`${fix.setCode}: fix ${fix.datasetId} ${fix.header} → ${code}`)
    }
  }
  if (unknown.length > 0) throw new Error(`vocabulary tables name codes their terms do not have:\n${unknown.join("\n")}`)
  return { terms, map, fixes }
}

/** Reads every table in `dir`, or an empty plan when the directory is absent. */
export function readVocabularyPlan(dir: string): VocabularyPlan {
  if (!existsSync(dir)) return { terms: new Map(), map: new Map(), fixes: [] }
  const files = new Map(readdirSync(dir)
    .filter((name) => name.endsWith(".tsv"))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")]))
  return vocabularyPlanOf(files)
}

/**
 * The planned codes a minted code goes to, or null when the plan does not cover
 * the set. **A minted code the map does not place is an error**, not a term to
 * keep: the table was written against every code the input has.
 */
export function plannedCodesOf(plan: VocabularyPlan, setCode: string, code: string): string[] | null {
  const targets = plan.map.get(setCode)
  if (targets === undefined) return null
  const to = targets.get(code)
  if (to === undefined) throw new Error(`the ${setCode} map does not place the code "${code}"`)
  return to
}

/** Where a fix is applied: the research, the dataset's ID as v1 wrote it, and the key each set's values are under. */
export interface FixTarget {
  hum: string
  datasetId: string
  keyIdOfSet: (setCode: string) => string | undefined
  termIdOf: (setCode: string, code: string) => string | undefined
}

function headingOf(experiment: DatasetContent["experiments"][number], labelCount: Map<string, number>): string[] {
  const label = experiment.label.state === "value" ? experiment.label.value : ""
  const shared = (labelCount.get(label) ?? 0) > 1
  return shared ? [`${label} [${experiment.id}]`] : [label, `${label} [${experiment.id}]`]
}

/**
 * The dataset with the fixes for it applied, and the fixes that landed. A term
 * already there is not added twice; removing one that is not there does
 * nothing; a value left with no term is removed.
 */
export function applyVocabularyFixes(
  dataset: DatasetContent,
  fixes: readonly VocabularyFix[],
  target: FixTarget,
): { dataset: DatasetContent, applied: Set<VocabularyFix> } {
  const applied = new Set<VocabularyFix>()
  const mine = fixes.filter((fix) => fix.hum === target.hum && fix.datasetId === target.datasetId)
  if (mine.length === 0) return { dataset, applied }
  const labelCount = new Map<string, number>()
  for (const experiment of dataset.experiments) {
    const label = experiment.label.state === "value" ? experiment.label.value : ""
    labelCount.set(label, (labelCount.get(label) ?? 0) + 1)
  }
  const idOf = (setCode: string, code: string): string => {
    const id = target.termIdOf(setCode, code)
    if (id === undefined) throw new Error(`no term ${setCode}/${code} for a fix of ${target.datasetId}`)
    return id
  }
  const experiments = dataset.experiments.map((experiment) => {
    const headings = headingOf(experiment, labelCount)
    let values: ValueSlot[] = experiment.values
    for (const fix of mine) {
      if (!headings.includes(fix.header)) continue
      const keyId = target.keyIdOfSet(fix.setCode)
      if (keyId === undefined) throw new Error(`no key holds the ${fix.setCode} vocabulary`)
      applied.add(fix)
      const slot = values.find((one) => one.keyId === keyId)
      const held = slot?.value.kind === "vocabulary" && slot.value.termIds.state === "value" ? slot.value.termIds.value : []
      const removed = new Set(fix.remove.map((code) => idOf(fix.setCode, code)))
      const termIds = [...new Set([...held.filter((id) => !removed.has(id)), ...fix.add.map((code) => idOf(fix.setCode, code))])]
      const next: ValueSlot = { keyId, value: { kind: "vocabulary", termIds: { state: "value", value: termIds } } }
      if (termIds.length === 0) values = values.filter((one) => one.keyId !== keyId)
      else if (slot === undefined) values = [...values, next]
      else values = values.map((one) => one.keyId === keyId ? next : one)
    }
    return values === experiment.values ? experiment : { ...experiment, values }
  })
  return { dataset: { ...dataset, experiments }, applied }
}
