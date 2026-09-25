/**
 * The two distributions of the classification, on disk.
 *
 * Neither is kept in the repository. `npm run icd10:import` fetches them and
 * leaves them under `migration/input/` (git-ignored), and the dev data load
 * reads them from there to put the vocabulary in again after emptying the
 * catalog. A hand-placed copy
 * under the same name is used as it stands, which is how an environment with
 * no way out runs either at all.
 *
 * **English comes from WHO and Japanese from the Japanese statistical
 * classification.** They follow different versions, so a code held by only one
 * of them keeps the title it has.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { type Icd10Entry, mergeEntries, parseEstatCsv, parseWhoMeta } from "~/icd10/codes"

export const WHO_META_URL = "https://icdcdn.who.int/icd10/meta/icd102019enMeta.zip"
export const WHO_META_MEMBER = "icd102019syst_codes.txt"
export const WHO_LOCAL_NAME = "icd10-who-2019.txt"

export const ESTAT_CSV_URL = [
  "https://www.e-stat.go.jp/term/download?bKbn=40&kaiteiCode=03&charset=UTF-8&bom=false",
  "&searchMethod=keyword&searchWord=&komokuSearchFlg=1",
  "&info1SearchFlg=&info2SearchFlg=&info3SearchFlg=&info4SearchFlg=&info5SearchFlg=&info6SearchFlg=",
].join("")
export const ESTAT_LOCAL_NAME = "icd10-estat-2013.csv"

const INPUT_DIR = join(import.meta.dirname, "input")

export function heldText(name: string): string | null {
  try {
    return readFileSync(join(INPUT_DIR, name), "utf8")
  } catch {
    return null
  }
}

export function keepText(name: string, text: string): void {
  mkdirSync(INPUT_DIR, { recursive: true })
  writeFileSync(join(INPUT_DIR, name), text)
}

/**
 * Everything the two held distributions name, as one list — or null while
 * either is missing, which is the signal to fetch rather than a classification
 * with one language gone.
 */
export function heldIcd10Entries(): Icd10Entry[] | null {
  const who = heldText(WHO_LOCAL_NAME)
  const estat = heldText(ESTAT_LOCAL_NAME)
  if (who === null || estat === null) return null
  return mergeEntries(parseWhoMeta(who), parseEstatCsv(estat))
}
