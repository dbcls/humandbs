#!/usr/bin/env bun
/**
 * Check Dataset Ownership - Verify Research-Dataset 1:N relationship
 *
 * Validates that each Dataset is owned by exactly one Research (humId).
 * Reports any Datasets that are owned by multiple Research entries.
 *
 * Usage:
 *   bun run src/crawler/cli/check-ownership.ts
 */
import { readdirSync, readFileSync } from "fs"
import { join } from "path"

const STRUCTURED_DIR = "crawler-results/structured-json"
const RESEARCH_VERSION_DIR = join(STRUCTURED_DIR, "research-version")

interface DatasetRef {
  datasetId: string
  version: string
}

interface ResearchVersion {
  humId: string
  humVersionId: string
  version: string
  datasets: DatasetRef[]
}

interface OwnershipEntry {
  humId: string
  humVersionId: string
  version: string
}

const main = () => {
  // Map: datasetId -> list of owners (humId, humVersionId, version)
  const datasetOwners = new Map<string, OwnershipEntry[]>()

  // Read all research-version files
  const files = readdirSync(RESEARCH_VERSION_DIR).filter(f => f.endsWith(".json"))

  for (const file of files) {
    const filePath = join(RESEARCH_VERSION_DIR, file)
    const content = readFileSync(filePath, "utf8")
    const research: ResearchVersion = JSON.parse(content)

    for (const dataset of research.datasets) {
      const key = `${dataset.datasetId}-${dataset.version}`
      const entry: OwnershipEntry = {
        humId: research.humId,
        humVersionId: research.humVersionId,
        version: dataset.version,
      }

      if (!datasetOwners.has(key)) {
        datasetOwners.set(key, [])
      }
      datasetOwners.get(key)!.push(entry)
    }
  }

  // Find datasets with multiple owners
  const conflicts: { datasetKey: string; owners: OwnershipEntry[] }[] = []

  for (const [datasetKey, owners] of datasetOwners) {
    // Check if multiple different humIds own this dataset version
    const uniqueHumIds = new Set(owners.map(o => o.humId))
    if (uniqueHumIds.size > 1) {
      conflicts.push({ datasetKey, owners })
    }
  }

  // Report results
  if (conflicts.length === 0) {
    console.log("✅ All datasets have single ownership (1:N relationship is valid)")
    console.log(`   Checked ${datasetOwners.size} dataset versions across ${files.length} research versions`)
  } else {
    console.log(`❌ Found ${conflicts.length} dataset(s) with multiple owners:\n`)

    for (const conflict of conflicts) {
      const [datasetId, version] = conflict.datasetKey.split("-")
      console.log(`Dataset: ${datasetId} (${version})`)
      console.log("  Owners:")
      for (const owner of conflict.owners) {
        console.log(`    - ${owner.humId} (${owner.humVersionId})`)
      }
      console.log()
    }

    // Summary table
    console.log("Summary:")
    console.log("| Dataset ID | Version | Owners |")
    console.log("|------------|---------|--------|")
    for (const conflict of conflicts) {
      const [datasetId, version] = conflict.datasetKey.split("-")
      const humIds = [...new Set(conflict.owners.map(o => o.humId))].join(", ")
      console.log(`| ${datasetId} | ${version} | ${humIds} |`)
    }
  }

  // Also check for version-spanning ownership changes (same dataset, different versions, different owners)
  console.log("\n--- Version-spanning ownership analysis ---\n")

  // Group by datasetId (without version)
  const datasetVersions = new Map<string, Map<string, Set<string>>>()

  for (const [datasetKey, owners] of datasetOwners) {
    const parts = datasetKey.split("-")
    const version = parts.pop()!
    const datasetId = parts.join("-")

    if (!datasetVersions.has(datasetId)) {
      datasetVersions.set(datasetId, new Map())
    }
    const versionMap = datasetVersions.get(datasetId)!

    if (!versionMap.has(version)) {
      versionMap.set(version, new Set())
    }
    for (const owner of owners) {
      versionMap.get(version)!.add(owner.humId)
    }
  }

  // Find datasets where ownership changes across versions
  const ownershipChanges: { datasetId: string; versions: { version: string; humIds: string[] }[] }[] = []

  for (const [datasetId, versionMap] of datasetVersions) {
    const versions = [...versionMap.entries()]
      .map(([v, humIds]) => ({ version: v, humIds: [...humIds] }))
      .sort((a, b) => {
        const aNum = parseInt(a.version.replace("v", ""))
        const bNum = parseInt(b.version.replace("v", ""))
        return aNum - bNum
      })

    // Check if humIds change across versions
    const allHumIds = new Set<string>()
    for (const v of versions) {
      for (const humId of v.humIds) {
        allHumIds.add(humId)
      }
    }

    if (allHumIds.size > 1) {
      ownershipChanges.push({ datasetId, versions })
    }
  }

  if (ownershipChanges.length === 0) {
    console.log("✅ No ownership changes across dataset versions")
  } else {
    console.log(`⚠️  Found ${ownershipChanges.length} dataset(s) with ownership changes across versions:\n`)

    for (const change of ownershipChanges) {
      console.log(`Dataset: ${change.datasetId}`)
      for (const v of change.versions) {
        console.log(`  ${v.version}: ${v.humIds.join(", ")}`)
      }
      console.log()
    }
  }
}

main()
