/**
 * 構造化 JSON (DsApplicationTransformed / DuApplicationTransformed) を
 * EAV (Entity-Attribute-Value) パターンに逆変換するスクリプト。
 *
 * Usage: bun run scripts/reverse-transform.ts
 *
 * 入力:
 *   - json-data/ds-applications-transformed.json
 *   - json-data/du-applications-transformed.json
 *
 * 出力:
 *   - json-data/ds-applications-reversed.json
 *   - json-data/du-applications-reversed.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type {
  DsApplicationTransformed,
  DuApplicationTransformed,
} from "@/crawler/types/jga-shinsei"

import {
  pushComponent,
  pushBilingual,
  fromBooleanOrNull,
  reverseHead,
  reversePi,
  reverseSubmitter,
  reverseControl,
  reverseCollaborators,
  reverseUploadedFiles,
  reverseDataGroup,
  reverseMembers,
  reverseUseDatasets,
  reverseStatusHistory,
  reverseDsApplication,
  reverseDuApplication,
} from "@/crawler/processors/jga-shinsei/reverse-transform"

// Re-export for test compatibility
export {
  pushComponent,
  pushBilingual,
  fromBooleanOrNull,
  reverseHead,
  reversePi,
  reverseSubmitter,
  reverseControl,
  reverseCollaborators,
  reverseUploadedFiles,
  reverseDataGroup,
  reverseMembers,
  reverseUseDatasets,
  reverseStatusHistory,
  reverseDsApplication,
  reverseDuApplication,
}

// === Main ===

const main = (): void => {
  const baseDir = path.resolve(import.meta.dir, "..")
  const jsonDataDir = path.join(baseDir, "json-data")

  const dsTransformed: DsApplicationTransformed[] = JSON.parse(
    readFileSync(
      path.join(jsonDataDir, "ds-applications-transformed.json"),
      "utf-8",
    ),
  )
  const dsReversed = dsTransformed.map(reverseDsApplication)
  writeFileSync(
    path.join(jsonDataDir, "ds-applications-reversed.json"),
    JSON.stringify(dsReversed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Reversed ${dsReversed.length} DS applications`)

  const duTransformed: DuApplicationTransformed[] = JSON.parse(
    readFileSync(
      path.join(jsonDataDir, "du-applications-transformed.json"),
      "utf-8",
    ),
  )
  const duReversed = duTransformed.map(reverseDuApplication)
  writeFileSync(
    path.join(jsonDataDir, "du-applications-reversed.json"),
    JSON.stringify(duReversed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Reversed ${duReversed.length} DU applications`)
}

if (import.meta.main) {
  main()
}
