/**
 * A dataset's values written anew by hand, once each dataset has its own copy.
 *
 * The articles wrote one experiment table for several datasets, and a value of
 * one archive in another's row: EGA's accessions in the JGA row, INSDC's
 * sequences and the JGA studies in the DRA row. By the time a dataset's values
 * are built the table is divided among its datasets (`inversion.ts`), so what
 * is corrected is what each dataset ends up with, not the table the division
 * was written against.
 *
 * An edit names the research, the key by its code, the language, and the text
 * the value holds (its lines joined), so it lands on every version, draft and
 * dataset that holds that text and on nothing else:
 *
 * - `set` writes the value anew from markdown; an empty one takes the language
 *   away, and a value neither language holds anything of is taken out;
 * - `add` gives a key a value from markdown in each experiment where another
 *   key holds a given text, read before any edit of the experiment is made.
 *
 * **An edit that lands nowhere stops the load**, since it was written against
 * the loaded values and not landing means one of the two has moved.
 */

import type { RichText, Slot } from "~/content/types"

import { richTextFromMarkdown } from "./richtext"

type Lang = "ja" | "en"

export type ValueEdit
  = | { op: "set", hum: string, key: string, lang: Lang, was: string, markdown: string }
    | { op: "add", hum: string, key: string, lang: Lang, markdown: string, besideKey: string, besideWas: string }

interface TextValue {
  kind: "text"
  text: { ja: Slot<RichText>, en: Slot<RichText> }
}

interface Values {
  keyId: string
  value: { kind: string }
}

interface Described {
  experiments?: { values: Values[] }[]
}

const isText = (value: { kind: string }): value is TextValue => value.kind === "text"

/** A language of a text value as its lines, or null where it holds no value. */
function linesOf(value: TextValue, lang: Lang): string | null {
  const slot = value.text[lang]
  return slot.state === "value" ? slot.value.map((line) => line.map((span) => span.text).join("")).join("\n") : null
}

const holdsNothing = (slot: Slot<RichText>) => slot.state === "value" && slot.value.length === 0

/** A dataset's description with its edits made, adding each edit that found its text to `applied`. */
export function editValues<T extends Described>(
  content: T,
  hum: string,
  edits: readonly ValueEdit[],
  keyIdOf: (code: string) => string | undefined,
  applied: Set<ValueEdit>,
): T {
  const own = edits.filter((edit) => edit.hum === hum)
  if (own.length === 0 || content.experiments === undefined) return content
  const keyId = (code: string) => {
    const found = keyIdOf(code)
    if (found === undefined) throw new Error(`value edit for ${hum}: no key ${code}`)
    return found
  }
  const experiments = content.experiments.map((experiment) => {
    const before = new Map(experiment.values.map((one) => [one.keyId, one.value]))
    const heldBefore = (code: string, lang: Lang) => {
      const value = before.get(keyId(code))
      return value !== undefined && isText(value) ? linesOf(value, lang) : null
    }
    let values = experiment.values
    const touched = new Set<string>()
    for (const edit of own) {
      const target = keyId(edit.key)
      const written: Slot<RichText> = { state: "value", value: richTextFromMarkdown(edit.markdown) }
      if (edit.op === "set") {
        if (heldBefore(edit.key, edit.lang) !== edit.was) continue
        values = values.map((one) => (one.keyId === target && isText(one.value)
          ? { ...one, value: { ...one.value, text: { ...one.value.text, [edit.lang]: written } } }
          : one))
      } else {
        if (heldBefore(edit.besideKey, edit.lang) !== edit.besideWas) continue
        const present = values.find((one) => one.keyId === target)
        const empty: Slot<RichText> = { state: "value", value: [] }
        const base: TextValue = present !== undefined && isText(present.value) ? present.value : { kind: "text", text: { ja: empty, en: empty } }
        const next = { keyId: target, value: { ...base, text: { ...base.text, [edit.lang]: written } } }
        values = present === undefined ? [...values, next] : values.map((one) => (one === present ? next : one))
      }
      applied.add(edit)
      touched.add(target)
    }
    if (touched.size === 0) return experiment
    const emptied = (one: Values) => touched.has(one.keyId) && isText(one.value) && holdsNothing(one.value.text.ja) && holdsNothing(one.value.text.en)
    return { ...experiment, values: values.filter((one) => !emptied(one)) }
  })
  return experiments.every((one, at) => one === content.experiments?.[at]) ? content : { ...content, experiments }
}

/** Stops the load if an edit found its text nowhere. */
export function assertValueEditsApplied(edits: readonly ValueEdit[], applied: ReadonlySet<ValueEdit>): void {
  const unlanded = edits.filter((edit) => !applied.has(edit))
  if (unlanded.length > 0) {
    throw new Error(`value edits that found nothing:\n${unlanded.map((edit) => `${edit.hum} ${edit.key} ${edit.lang} ${edit.op === "set" ? edit.was : edit.besideWas}`).join("\n")}`)
  }
}
