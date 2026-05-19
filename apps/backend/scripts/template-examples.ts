/**
 * Generate sample responses for the Template endpoints (no auth, no server).
 *
 * Run with:
 *   docker compose exec backend bun run apps/backend/scripts/template-examples.ts
 *
 * Hits real DDBJ Search API for JGAD / DRA. J-DS uses the local fixture in
 * `apps/backend/jga-shinsei/json-data-example/ds-applications.json` instead of
 * the live JGA-Shinsei DB so this works without DB credentials.
 */
import { join } from "node:path"

import { mapDraSubmissionToDatasetTemplate } from "@/api/routes/templates/mapping-dataset-dra"
import { mapJgadToDatasetTemplate } from "@/api/routes/templates/mapping-dataset-jgad"
import { mapDsApplicationToResearchTemplate } from "@/api/routes/templates/mapping-research"
import { transformDsApplication } from "@/crawler/processors/jga-shinsei/transform"
import type { RawDsApplication } from "@/crawler/types/jga-shinsei"
import { readJson } from "@/crawler/utils/io"

const banner = (title: string) => {
  console.log("\n" + "=".repeat(80))
  console.log(title)
  console.log("=".repeat(80))
}

const REPO_ROOT = join(import.meta.dir, "..")
const FIXTURE_PATH = join(
  REPO_ROOT,
  "jga-shinsei",
  "json-data-example",
  "ds-applications.json",
)

const main = async () => {
  // 1. Dataset template from a real JGAD accession
  banner("GET /templates/dataset/JGAD000001")
  const jgad = await mapJgadToDatasetTemplate("JGAD000001")
  console.log(JSON.stringify(jgad, null, 2))

  // 2. Dataset template from a real DRA Submission accession (DRX = 1)
  banner("GET /templates/dataset/DRA000001")
  const dra = await mapDraSubmissionToDatasetTemplate("DRA000001")
  console.log(JSON.stringify(dra, null, 2))

  // 3. Research template from a local J-DS fixture (DB-less)
  banner("GET /templates/research/<from fixture>")
  const raws = readJson<RawDsApplication[]>(FIXTURE_PATH)
  if (!raws || raws.length === 0) {
    console.error("fixture is empty or unreadable")
    return
  }
  const jds = transformDsApplication(raws[0])
  const research = await mapDsApplicationToResearchTemplate(jds)
  console.log(JSON.stringify(research, null, 2))
}

void main()
