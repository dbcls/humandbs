/**
 * Principal investigators written as one entry.
 *
 * The old articles named every principal investigator on one line —
 * `研究代表者： 山岸 誠 / 山野 嘉久`, with the affiliations on the next line in
 * the same order — and v1 took each line as one person. v2 holds a list of
 * people, each with an affiliation, so such an entry is written out as the
 * people it names (`hand/data-providers.json`). A split with no affiliation of
 * its own keeps the one the entry had, which is the affiliation the article
 * gave all of them.
 *
 * An entry is matched by its Japanese name, with the spacing and the slash
 * written either way, in every version of the research, drafts included.
 * **A split that matches nothing stops the load**, since it was written against
 * the input.
 */

import type { EsDataProvider, EsResearchVersion } from "./es"

export interface ProviderSplit {
  hum: string
  /** The entry's Japanese name as v1 holds it. */
  name: string
  providers: {
    name: { ja: string, en: string }
    organization?: { ja: string, en: string }
  }[]
  /** Where in the article the people and their affiliations were read from. */
  note?: string
}

function comparable(name: string): string {
  return name.replace(/[／/]/g, "/").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim()
}

const written = (ja: string, en: string) => ({ ja: { text: ja, rawHtml: null }, en: { text: en, rawHtml: null } })

/** Replaces every entry a split names, in every version given, and stops if a split names nothing. */
export function applyProviderSplits(versions: Iterable<EsResearchVersion>, splits: readonly ProviderSplit[]): void {
  const applied = new Set<ProviderSplit>()
  for (const version of versions) {
    const mine = splits.filter((split) => split.hum === version.humId)
    if (mine.length === 0 || !version.dataProvider) continue
    version.dataProvider = version.dataProvider.flatMap((entry): EsDataProvider[] => {
      const split = mine.find((one) => comparable(one.name) === comparable(entry.name?.ja?.text ?? ""))
      if (split === undefined) return [entry]
      applied.add(split)
      return split.providers.map((person) => ({
        name: written(person.name.ja, person.name.en),
        organization: person.organization === undefined
          ? entry.organization ?? null
          : { name: written(person.organization.ja, person.organization.en), address: null },
        orcid: null,
        email: null,
      }))
    })
  }
  const missed = splits.filter((split) => !applied.has(split))
  if (missed.length > 0) {
    throw new Error(`provider splits that found nothing:\n${missed.map((split) => `${split.hum} ${split.name}`).join("\n")}`)
  }
}
