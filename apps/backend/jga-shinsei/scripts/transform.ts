/**
 * EAV (Entity-Attribute-Value) パターンの JGA 申請データを
 * API フレンドリーな構造に変換するスクリプト。
 *
 * Usage: bun run scripts/transform.ts
 *
 * 入力:
 *   - json-data/ds-applications.json (J-DS データ提供申請)
 *   - json-data/du-applications.json (J-DU データ利用申請)
 *
 * 出力:
 *   - json-data/ds-applications-transformed.json
 *   - json-data/du-applications-transformed.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import type {
  RawDsApplication,
  RawDuApplication,
} from "@/crawler/types/jga-shinsei"

import {
  createHelpers,
  toBooleanOrNull,
  buildCollaborators,
  buildUploadedFiles,
  buildDataGroup,
  buildMembers,
  buildUseDatasets,
  buildStatusHistory,
  transformDsApplication,
  transformDuApplication,
} from "@/crawler/processors/jga-shinsei/transform"

// Re-export for test compatibility
export {
  createHelpers,
  toBooleanOrNull,
  buildCollaborators,
  buildUploadedFiles,
  buildDataGroup,
  buildMembers,
  buildUseDatasets,
  buildStatusHistory,
  transformDsApplication,
  transformDuApplication,
}

// === Main ===

const main = (): void => {
  const baseDir = path.resolve(import.meta.dir, "..")
  const jsonDataDir = path.join(baseDir, "json-data")

  const dsRaw: RawDsApplication[] = JSON.parse(
    readFileSync(path.join(jsonDataDir, "ds-applications.json"), "utf-8"),
  )
  const dsTransformed = dsRaw.map(transformDsApplication)
  writeFileSync(
    path.join(jsonDataDir, "ds-applications-transformed.json"),
    JSON.stringify(dsTransformed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Transformed ${dsTransformed.length} DS applications`)

  const duRaw: RawDuApplication[] = JSON.parse(
    readFileSync(path.join(jsonDataDir, "du-applications.json"), "utf-8"),
  )
  const duTransformed = duRaw.map(transformDuApplication)
  writeFileSync(
    path.join(jsonDataDir, "du-applications-transformed.json"),
    JSON.stringify(duTransformed, null, 2) + "\n",
    "utf-8",
  )
  console.log(`Transformed ${duTransformed.length} DU applications`)
}

if (import.meta.main) {
  main()
}
