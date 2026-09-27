/**
 * Disease names corrected by hand against the articles.
 *
 * The rules of `diseases.ts` take a name from the words in front of its code.
 * A few articles write the disease where no rule finds it, and those values are
 * put right here, one at a time:
 *
 * - the English text names a disease without its code (`39 non-syndromic
 *   hearing loss patients`), so the value has the Japanese name only — the
 *   English one is taken from the English text;
 * - a sentence runs through several codes (`VHL病（ICD10：Q858）に伴う遺伝性淡明細胞型
 *   腎細胞がん（ICD10：C64）`), and the words in front of a code are not all name;
 * - a value repeats a disease the experiment already has, under words that
 *   are not a name (`Co-cultures of 1 joint fluid from another rheumatoid
 *   arthritis`), and is dropped.
 *
 * An edit names the research and the value by its two names as the rules read
 * them, so it lands on every version and every draft that has the value. An
 * edit that also names a `dataset`, by the ID v1 gave it, lands on that
 * dataset only: a value one dataset has from another's line in a shared cell
 * is that one's to lose, and that edit is taken over one for the whole research
 * that finds the same value. Where two values of the research have the same names
 * under different codes (`肺腺がん` under C349 and under C34), the edit names the
 * codes as well. **An edit that lands nowhere stops the load**, since
 * it was written against the input and not landing means one of the two has
 * moved.
 */

import type { DatasetContent, DiseaseValue } from "~/content/types"

export interface DiseaseEdit {
  hum: string
  /** The dataset the edit is about, by the ID v1 gave it; without one, every dataset of the research. */
  dataset?: string
  /** The value's names as the rules read them. */
  nameJa: string | null
  nameEn: string | null
  /** The value's codes, where another value of the research has the same names; without them, any codes. */
  codes?: string[]
  /** The names it gets; a name left out stays as it is. */
  set?: { nameJa?: string | null, nameEn?: string | null }
  /** Removes the value. */
  drop?: true
  /** Why, for whoever reads the table. */
  note?: string
}

const sameValue = (a: DiseaseValue, b: DiseaseValue) =>
  a.nameJa === b.nameJa && a.nameEn === b.nameEn
  && a.termIds.length === b.termIds.length && a.termIds.every((id) => b.termIds.includes(id))

const sameCodes = (named: readonly string[], held: readonly (string | undefined)[]) =>
  named.length === held.length && named.every((code) => held.includes(code))

/**
 * A dataset of one research with its disease values edited, adding each edit
 * that found its value to `applied`. **Two values an edit makes the same are
 * one**, the way the rules make one value of a disease an article writes twice.
 */
export function editDiseases(
  dataset: DatasetContent,
  hum: string,
  edits: readonly DiseaseEdit[],
  applied: Set<DiseaseEdit>,
  /** The names each research's values have, for saying what an edit that found nothing could have meant. */
  seen?: Map<string, Set<string>>,
  /** The ID v1 gave the dataset. */
  label?: string,
  /** The code of a term, for the edits that name codes. */
  codeOf: (termId: string) => string | undefined = () => undefined,
): DatasetContent {
  const own = edits
    .filter((edit) => edit.hum === hum && (edit.dataset === undefined || edit.dataset === label))
    .toSorted((a, b) => Number(a.dataset === undefined) - Number(b.dataset === undefined))
  if (own.length === 0) return dataset
  const names = seen?.get(hum) ?? new Set<string>()
  seen?.set(hum, names)
  return {
    ...dataset,
    experiments: dataset.experiments.map((experiment) => ({
      ...experiment,
      values: experiment.values.flatMap((slot) => {
        const value = slot.value
        if (value.kind !== "disease" || value.diseases.state !== "value") return [slot]
        const edited: DiseaseValue[] = []
        for (const one of value.diseases.value) {
          names.add(`${JSON.stringify(one.nameJa)} / ${JSON.stringify(one.nameEn)}`)
          const edit = own.find((candidate) => candidate.nameJa === one.nameJa && candidate.nameEn === one.nameEn
            && (candidate.codes === undefined || sameCodes(candidate.codes, one.termIds.map(codeOf))))
          if (edit !== undefined) applied.add(edit)
          if (edit?.drop === true) continue
          const made = edit?.set === undefined ? one : { ...one, ...edit.set }
          if (!edited.some((held) => sameValue(held, made))) edited.push(made)
        }
        // An empty list is a slot that should not exist (`app/content/types.ts`).
        if (edited.length === 0) return []
        return [{ ...slot, value: { ...value, diseases: { state: "value" as const, value: edited } } }]
      }),
    })),
  }
}

/** Stops the load if an edit found its value nowhere. */
export function assertDiseaseEditsApplied(
  edits: readonly DiseaseEdit[],
  applied: ReadonlySet<DiseaseEdit>,
  seen: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): void {
  const unlanded = edits.filter((edit) => !applied.has(edit))
  if (unlanded.length > 0) {
    const lines = unlanded.map((edit) => {
      const held = [...seen.get(edit.hum) ?? []].map((names) => `\n    ${names}`).join("")
      return `${edit.hum} ${JSON.stringify(edit.nameJa)} / ${JSON.stringify(edit.nameEn)}${held === "" ? "" : `; the research has${held}`}`
    })
    throw new Error(`disease edits that found nothing:\n${lines.join("\n")}`)
  }
}
