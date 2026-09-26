/**
 * The rows of the articles' experiment tables that say "does not apply".
 *
 * An article's experiment table has a row for every heading of its template,
 * and the rows that do not apply to the experiment — the sample source "if
 * purchased", the target loci "if Target Capture" — hold a dash. v1 read a
 * dash as nothing and dropped the row, so the dump has no trace of it. v2 has a
 * state for a value that does not exist, which the page shows as such, so the
 * rows are read again from the articles and the dash is put back where v1
 * dropped it; the build turns it into that state (`build.ts` の `isDashCell`).
 *
 * **A table is the experiment whose values it holds.** The dump does not
 * record which table an experiment came from, so the table on the research's
 * page whose other rows have the words of the experiment's values is taken,
 * the way the rest of the load finds a value's cell (`research-pages.ts`).
 */

import type { Element } from "hast"

import type { EsDataset, EsExperiment } from "./es"
import type { KeyRule } from "./prepare"
import { type Lang, parseFragment } from "./richtext-html"
import { type PageArticle, researchPageOf, sameWords, type Site, tableRows } from "./research-pages"

/** A dash and nothing else, of any of the widths the articles type. */
export const DASH = /^[\s\u00a0\u3000]*[-\uff0d\u30fc\u2015\u2014\u2013\u2010]+[\s\u00a0\u3000]*$/

interface Row {
  heading: string
  /** The row's value as `sameWords` has it, or null for a dash. */
  words: string | null
}

type Table = Row[]

function cellText(cell: Element): string {
  const walk = (node: Element["children"][number]): string => {
    if (node.type === "text") return node.value
    if (node.type !== "element") return ""
    const inner = node.children.map(walk).join("")
    return node.tagName === "br" || node.tagName === "p" || node.tagName === "div" ? `\n${inner}\n` : inner
  }
  return cell.children.map(walk).join("").trim()
}

/** The tables of one page as heading and value rows, those with at least one dash only. */
function tablesOf(article: PageArticle): Table[] {
  const tables: Table[] = []
  const all: Element[] = []
  const collect = (node: { children: readonly unknown[] }) => {
    for (const child of node.children) {
      const element = child as { type?: string }
      if (element.type !== "element") continue
      if ((child as Element).tagName === "table") all.push(child as Element)
      collect(child as Element)
    }
  }
  collect(parseFragment(article.introtext))
  for (const table of all) {
    const rows = tableRows(table).flatMap((cells): Row[] => {
      if (cells.length !== 2) return []
      const [head, value] = cells.map(cellText)
      if (head === undefined || value === undefined || head === "") return []
      return [{ heading: head, words: DASH.test(value) ? null : sameWords(value) }]
    })
    if (rows.some((row) => row.words === null) && rows.some((row) => row.words !== null && row.words !== "")) tables.push(rows)
  }
  return tables
}

const squashed = (text: string) => text.normalize("NFKC").replace(/\s+/g, "").toLowerCase()

/**
 * v1's table of headings: which of its keys each heading of each language was
 * read into (the crawler's `moldata-header-mapping.tsv`, columns 1, 2 and 4).
 */
export function headingKeys(tsv: string): Map<string, string> {
  const keys = new Map<string, string>()
  for (const line of tsv.split("\n").slice(1)) {
    const [ja, en, , key] = line.split("\t").map((cell) => cell.trim())
    if (key === undefined || key === "") continue
    if (ja) keys.set(squashed(ja), key)
    if (en) keys.set(squashed(en), key)
  }
  return keys
}

export interface DashCounts {
  /** Experiments a table was found for. */
  matched: number
  /** Experiments no table on the pages was the one of. */
  unmatched: number
  /** Cells a dash was put back into. */
  restored: number
  /** Dash rows whose heading v1's table does not have. */
  unknownHeadings: Map<string, number>
}

/** The table among these that is the experiment's, if exactly one is. */
function tableOf(experiment: EsExperiment, lang: Lang, tables: readonly Table[]): Table | null {
  const said = new Set(Object.values(experiment.data ?? {}).map((value) => sameWords(value[lang]?.text ?? "")).filter((words) => words !== ""))
  let best: Table | null = null
  let bestScore = 0
  let tied = false
  for (const table of tables) {
    const filled = table.filter((row) => row.words !== null && row.words !== "")
    const found = filled.filter((row) => said.has(row.words ?? "")).length
    // Most of the table has to be the experiment's: a table sharing one
    // accession with it is another dataset's.
    if (found < 2 || found * 2 < filled.length) continue
    if (found > bestScore) {
      best = table
      bestScore = found
      tied = false
    } else if (found === bestScore) {
      const dashes = (one: Table) => one.filter((row) => row.words === null).map((row) => row.heading).join("\n")
      if (best !== null && dashes(best) !== dashes(table)) tied = true
    }
  }
  return tied ? null : best
}

/**
 * Puts back the dash of every row v1 dropped, into the key the row's heading
 * goes to once the key rules have been followed (`prepare.ts` の
 * `followedRules`). **A key already holding a value keeps it**, in either
 * language: another row of the table was merged into it.
 */
export function restoreDashes(
  docs: Iterable<EsDataset & { humVersionId?: string }>,
  articles: readonly { site: Site, articles: Iterable<PageArticle> }[],
  headings: ReadonlyMap<string, string>,
  rules: ReadonlyMap<string, KeyRule>,
): DashCounts {
  const pages = new Map<string, Table[]>()
  const versionsOf = new Map<string, number[]>()
  for (const { site, articles: held } of articles) {
    for (const article of held) {
      const page = researchPageOf(article)
      if (page === null) continue
      const key = `${site}/${page.humId}/${page.version}/${page.lang}`
      if (pages.has(key) && article.state !== 1) continue
      pages.set(key, tablesOf(article))
      if (site === "prod") versionsOf.set(page.humId, [...new Set([...(versionsOf.get(page.humId) ?? []), page.version])])
    }
  }
  const counts: DashCounts = { matched: 0, unmatched: 0, restored: 0, unknownHeadings: new Map() }
  for (const doc of docs) {
    const version = Number(/-v(\d+)$/.exec(doc.humVersionId ?? "")?.[1] ?? Number.NaN)
    const others = (versionsOf.get(doc.humId) ?? []).filter((one) => one !== version).toSorted((a, b) => b - a)
    const candidates = [`prod/${doc.humId}/${version}`, `staging/${doc.humId}/${version}`, ...others.map((one) => `prod/${doc.humId}/${one}`)]
    for (const experiment of doc.experiments ?? []) {
      let found = false
      for (const lang of ["ja", "en"] as const) {
        const table = candidates.reduce<Table | null>((held, page) => held ?? tableOf(experiment, lang, pages.get(`${page}/${lang}`) ?? []), null)
        if (table === null) continue
        found = true
        for (const row of table) {
          if (row.words !== null) continue
          const v1Key = headings.get(squashed(row.heading))
          if (v1Key === undefined) {
            counts.unknownHeadings.set(row.heading, (counts.unknownHeadings.get(row.heading) ?? 0) + 1)
            continue
          }
          const rule = rules.get(v1Key)
          if (rule?.action === "drop") continue
          const key = rule?.action === "merge-into" ? rule.to : v1Key
          const data = experiment.data ?? {}
          const held = data[key]
          // A value in the other language came from another row of the same
          // key, which the table did not fill with a dash; that language's page
          // shows it in this one's place.
          const said = (["ja", "en"] as const).some((one) => {
            const text = (held?.[one]?.text ?? "").trim()
            return text !== "" && !DASH.test(text)
          })
          if (said || (held?.[lang]?.text ?? "").trim() !== "") continue
          data[key] = { ...held, [lang]: { text: "-", rawHtml: null } }
          experiment.data = data
          counts.restored += 1
        }
      }
      if (found) counts.matched += 1
      else counts.unmatched += 1
    }
  }
  return counts
}
