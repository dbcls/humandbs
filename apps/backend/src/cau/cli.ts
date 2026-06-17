import yargs from "yargs"
import { hideBin } from "yargs/helpers"

import { closeJgaDb } from "@/api/db-client/client"
import type { Person } from "@/crawler/types/structured"

import { toPersonDoc, updateAllCau } from "./es-writer"
import { extractCore, extractDuPhase, extractJgad, extractJgadHumId, extractPeople } from "./extract"
import { buildDuPhaseMap, buildJgadHumMap, buildOccurrences, runPipeline } from "./pipeline"
import { resolvePersons } from "./resolve"

const parseArgs = () =>
  yargs(hideBin(process.argv))
    .option("dry-run", { type: "boolean", default: false, describe: "Skip ES update, show planned changes" })
    .option("hum-id", { alias: "i", type: "string", describe: "Update only this hum (debug)" })
    .option("verbose", { alias: "v", type: "boolean", default: false, describe: "Verbose logging" })
    .parseSync()

const main = async () => {
  const args = parseArgs()

  console.log("=== generate-cau: CAU batch generation ===")
  console.log("")

  console.log("[1/5] Extracting from jgadb...")
  console.log("  extracting core...")
  const coreRaw = await extractCore()
  console.log(`  core: ${coreRaw.length}`)
  console.log("  extracting people...")
  const peopleRaw = await extractPeople()
  console.log(`  people: ${peopleRaw.length}`)
  console.log("  extracting jgad...")
  const jgadRaw = await extractJgad()
  console.log(`  jgad: ${jgadRaw.length}`)
  console.log("  extracting du-phase...")
  const duPhaseRaw = await extractDuPhase()
  console.log(`  du-phase: ${duPhaseRaw.length}`)
  console.log("  extracting jgad-humid...")
  const jgadHumIdRaw = await extractJgadHumId()
  console.log(`  jgad-hum: ${jgadHumIdRaw.length}`)

  console.log("[2/5] Building occurrences...")
  const occs = buildOccurrences(coreRaw, peopleRaw)
  console.log(`  occurrences: ${occs.length}`)

  console.log("[3/5] Resolving persons (name resolution)...")
  const resolved = resolvePersons(occs)
  console.log(`  canonical persons: ${resolved.persons.length}`)

  console.log("[4/5] Running pipeline (Steps 1-4)...")
  const duPhase = buildDuPhaseMap(duPhaseRaw)
  const jgadHumMap = buildJgadHumMap(jgadHumIdRaw)

  const result = runPipeline(coreRaw, peopleRaw, jgadRaw, duPhase, jgadHumMap, resolved)

  console.log(`  in-scope DU: ${result.stats.inScopeDu}`)
  console.log(`  (person, JGAD) pairs: ${result.stats.personJgadPairs}`)
  console.log(`  (person, hum) pairs: ${result.stats.personHumPairs} (current: ${result.stats.currentPairs}, ended: ${result.stats.endedPairs})`)
  console.log(`  distinct hum: ${result.cauByHum.size}`)
  console.log(`  unmapped JGAD: ${result.stats.unmappedJgad}`)

  const cauByHumPersonDocs = new Map<string, Person[]>()
  for (const [humId, entries] of result.cauByHum) {
    if (args["hum-id"] && humId !== args["hum-id"]) continue
    cauByHumPersonDocs.set(
      humId,
      entries.map(e => toPersonDoc(e.rollup, e.person)),
    )
  }

  if (args.verbose) {
    for (const [humId, persons] of cauByHumPersonDocs) {
      console.log(`  ${humId}: ${persons.length} persons`)
    }
  }

  if (args["dry-run"]) {
    console.log("")
    console.log(`[DRY RUN] Would update ${cauByHumPersonDocs.size} hum documents`)
    console.log("=== Done (dry-run) ===")
    return
  }

  console.log("[5/5] Updating ES...")
  const esResult = await updateAllCau(cauByHumPersonDocs)
  console.log(`  cleared: ${esResult.cleared} docs, updated: ${esResult.updated}, not found: ${esResult.notFound}`)

  console.log("")
  console.log("=== Done ===")
}

if (import.meta.main) {
  main()
    .catch((err: unknown) => {
      console.error("Fatal error:", err)
      process.exit(1)
    })
    .finally(() => closeJgaDb())
}
