/**
 * Cells corrected by hand against the old portal's articles.
 *
 * v1 read each article's table through a heading table and kept only the
 * cell, so what the heading said is gone from the dump: several rows merged
 * into one key lose the heading that said which step each line was, a row whose
 * heading the table dropped is gone altogether, and a row whose two languages
 * the table resolved to different keys is split across them. Each is put back
 * here by reading the article again, one cell at a time.
 *
 * An edit names the research, the key as the dump spells it, the language, and
 * the cell's text as the dump holds it, so it lands on every version and every
 * dataset that has that cell and on nothing else:
 *
 * - `replace` rewrites the text (a heading put back in front of each line);
 * - `move` takes the text to another key, after what that key holds;
 * - `add` gives a key the text in each experiment where another key holds a
 *   given text — the row v1 dropped, found by a row it kept beside it;
 * - `substitute` replaces a part of the cell wherever it is written, in the
 *   text and in the HTML it was read from alike — a code the article got wrong.
 *   The two are written differently (`（ICD10：C719）` and `(ICD10: C719)`), so
 *   one edit per spelling
 *
 * **An edit that lands nowhere stops the load**, since it was written against
 * the input and not landing means one of the two has moved.
 */

import type { EsBilingualRich, EsDataset } from "./es"

type Lang = "ja" | "en"

export type CellEdit
  = | { op: "replace", hum: string, key: string, lang: Lang, before: string, after: string }
    | { op: "move", hum: string, key: string, lang: Lang, before: string, to: string }
    | { op: "add", hum: string, key: string, lang: Lang, text: string, besideKey: string, besideText: string }
    | { op: "substitute", hum: string, key: string, lang: Lang, find: string, replace: string }

function textIn(value: EsBilingualRich | undefined, lang: Lang): string {
  return value?.[lang]?.text ?? ""
}

function withText(value: EsBilingualRich | undefined, lang: Lang, text: string): EsBilingualRich {
  const other: Lang = lang === "ja" ? "en" : "ja"
  return { [lang]: { text, rawHtml: null }, [other]: { text: textIn(value, other), rawHtml: null } }
}

function appended(held: string, text: string): string {
  const lines = held === "" ? [] : held.split("\n")
  return [...lines, ...text.split("\n").filter((line) => line !== "" && !lines.includes(line))].join("\n")
}

/** Applies the edits to every dataset, and lists any that found nothing. */
export function applyCellEdits(docs: Iterable<EsDataset>, edits: readonly CellEdit[]): void {
  const applied = new Set<CellEdit>()
  for (const doc of docs) {
    for (const experiment of doc.experiments ?? []) {
      for (const edit of edits) {
        if (edit.hum !== doc.humId || !experiment.data) continue
        const data = experiment.data
        if (edit.op === "substitute") {
          const side = data[edit.key]?.[edit.lang]
          if (!side || !(side.text?.includes(edit.find) || side.rawHtml?.includes(edit.find))) continue
          experiment.data = {
            ...data,
            [edit.key]: {
              ...data[edit.key],
              [edit.lang]: {
                ...side,
                text: side.text?.replaceAll(edit.find, edit.replace) ?? side.text,
                rawHtml: side.rawHtml?.replaceAll(edit.find, edit.replace) ?? side.rawHtml,
              },
            },
          }
          applied.add(edit)
          continue
        }
        if (edit.op === "add") {
          if (textIn(data[edit.besideKey], edit.lang) !== edit.besideText) continue
          experiment.data = { ...data, [edit.key]: withText(data[edit.key], edit.lang, appended(textIn(data[edit.key], edit.lang), edit.text)) }
          applied.add(edit)
          continue
        }
        const value = data[edit.key]
        if (textIn(value, edit.lang) !== edit.before) continue
        applied.add(edit)
        if (edit.op === "replace") {
          experiment.data = { ...data, [edit.key]: withText(value, edit.lang, edit.after) }
          continue
        }
        const left = withText(value, edit.lang, "")
        const other: Lang = edit.lang === "ja" ? "en" : "ja"
        const { [edit.key]: _moved, ...rest } = data
        experiment.data = {
          ...rest,
          ...(textIn(left, other) === "" ? {} : { [edit.key]: left }),
          [edit.to]: withText(data[edit.to], edit.lang, appended(textIn(data[edit.to], edit.lang), edit.before)),
        }
      }
    }
  }
  const missed = edits.filter((edit) => !applied.has(edit))
  if (missed.length > 0) {
    throw new Error(`cell edits that found nothing:\n${missed.map((edit) => `${edit.op} ${edit.hum} ${edit.key} ${edit.lang}`).join("\n")}`)
  }
}
