/**
 * Fills the ICD10 dictionary from the two distributions.
 *
 * Neither distribution is kept in the repository, so this fetches them and
 * leaves what it downloaded under `migration/input/` (git-ignored) — a second
 * run reads the files and does not go out. A hand-placed copy under the same
 * name is used as it stands, which is how an environment with no way out runs
 * this at all.
 *
 * **English comes from WHO and Japanese from the Japanese statistical
 * classification.** They follow different versions, so a code held by only one
 * of them keeps the title it has (docs/development.md の
 * 「ICD10 の辞書を入れる」).
 *
 * Run at setup and after `test:db`, which empties the database.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { closePools, getOwnerDb } from "~/db/client.server"
import { mergeEntries, parseEstatCsv, parseWhoMeta } from "~/icd10/codes"
import {
  dictionarySize,
  ESTAT_CSV_URL,
  ESTAT_LOCAL_NAME,
  replaceDictionary,
  WHO_LOCAL_NAME,
  WHO_META_MEMBER,
  WHO_META_URL,
} from "~/icd10/dictionary.server"
import { readZipMember } from "~/icd10/zip"

const INPUT_DIR = join(import.meta.dirname, "..", "migration", "input")

function held(name: string): string | null {
  try {
    return readFileSync(join(INPUT_DIR, name), "utf8")
  } catch {
    return null
  }
}

function keep(name: string, text: string): void {
  mkdirSync(INPUT_DIR, { recursive: true })
  writeFileSync(join(INPUT_DIR, name), text)
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function whoMeta(): Promise<string> {
  const local = held(WHO_LOCAL_NAME)
  if (local !== null) return local
  console.log(`fetching ${WHO_META_URL}`)
  const member = await readZipMember(await fetchBytes(WHO_META_URL), WHO_META_MEMBER)
  const text = new TextDecoder().decode(member)
  keep(WHO_LOCAL_NAME, text)
  return text
}

async function estatCsv(): Promise<string> {
  const local = held(ESTAT_LOCAL_NAME)
  if (local !== null) return local
  console.log(`fetching ${ESTAT_CSV_URL.split("?")[0]}`)
  const text = new TextDecoder().decode(await fetchBytes(ESTAT_CSV_URL))
  keep(ESTAT_LOCAL_NAME, text)
  return text
}

const [who, estat] = await Promise.all([whoMeta(), estatCsv()])
const entries = mergeEntries(parseWhoMeta(who), parseEstatCsv(estat))
if (entries.length === 0) throw new Error("neither distribution yielded a single code")

const db = getOwnerDb()
await db.transaction(async (tx) => {
  await replaceDictionary(tx, entries)
})
const size = await dictionarySize(db)
console.log(`icd10_reference: ${size.codes} codes (en ${size.withEn} / ja ${size.withJa})`)
await closePools()
