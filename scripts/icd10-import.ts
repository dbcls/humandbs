/**
 * Puts the ICD10 classification in as the disease vocabulary.
 *
 * Neither distribution is kept in the repository, so this fetches them and
 * leaves what it downloaded under `migration/input/` (git-ignored) — a second
 * run reads the files and does not go out, and the dev data load reads the same
 * files (`migration/icd10-input.ts`). **English comes from WHO and Japanese
 * from the Japanese statistical classification.** They follow different
 * versions, so a code held by only one of them keeps the title it has
 * (docs/development.md の「ICD10 の語彙を入れる」).
 *
 * Run at setup, and again to take a newer distribution: the import upserts by
 * code, so what the data points at stays where it is.
 */

import { closePools, getOwnerDb } from "~/db/client.server"
import { icd10VocabularySize, importIcd10Terms } from "~/icd10/vocabulary.server"
import { readZipMember } from "~/icd10/zip"

import {
  ESTAT_CSV_URL,
  ESTAT_LOCAL_NAME,
  heldIcd10Entries,
  heldText,
  keepText,
  WHO_LOCAL_NAME,
  WHO_META_MEMBER,
  WHO_META_URL,
} from "../migration/icd10-input"

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchWhoMeta(): Promise<void> {
  if (heldText(WHO_LOCAL_NAME) !== null) return
  console.log(`fetching ${WHO_META_URL}`)
  const member = await readZipMember(await fetchBytes(WHO_META_URL), WHO_META_MEMBER)
  keepText(WHO_LOCAL_NAME, new TextDecoder().decode(member))
}

async function fetchEstatCsv(): Promise<void> {
  if (heldText(ESTAT_LOCAL_NAME) !== null) return
  console.log(`fetching ${ESTAT_CSV_URL.split("?")[0]}`)
  keepText(ESTAT_LOCAL_NAME, new TextDecoder().decode(await fetchBytes(ESTAT_CSV_URL)))
}

await Promise.all([fetchWhoMeta(), fetchEstatCsv()])
const entries = heldIcd10Entries()
if (entries === null || entries.length === 0) throw new Error("neither distribution yielded a single code")

const db = getOwnerDb()
const taken = await db.transaction((tx) => importIcd10Terms(tx, entries))
const size = await icd10VocabularySize(db)
console.log(
  `icd10: ${taken.roots} roots and ${taken.children} children taken in; `
  + `the vocabulary holds ${size.roots + size.children} (ja ${size.withJa})`,
)
await closePools()
