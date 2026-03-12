/**
 * Validate structured-json documents against Zod schemas (dry-run)
 *
 * Reads JSON files from:
 * - crawler-results/structured-json/research/
 * - crawler-results/structured-json/research-version/
 * - crawler-results/structured-json/dataset/
 *
 * Validates each document against its corresponding Zod schema and reports results.
 * Does NOT write to Elasticsearch — read-only validation only.
 */
import type { z } from "zod"

import { getSourceDir, readJsonFilesFromDir, transformResearch } from "./load-docs"
import {
  EsResearchSchema,
  EsDatasetSchema,
  ResearchVersionSchema,
} from "./types"

// === Types ===

export interface ValidationError {
  fileName: string
  issues: z.core.$ZodIssue[]
}

export interface ValidationResult {
  label: string
  total: number
  passed: number
  errors: ValidationError[]
}

// === Validation ===

/**
 * Validate documents against a Zod schema, with optional transform
 */
export const validateDocs = <T>(
  label: string,
  rawDocs: { fileName: string; data: unknown }[],
  schema: z.ZodType<T>,
  transform?: (doc: Record<string, unknown>) => Record<string, unknown>,
): ValidationResult => {
  const errors: ValidationError[] = []

  for (const { fileName, data } of rawDocs) {
    const transformed = transform
      ? transform(data as Record<string, unknown>)
      : data
    const parsed = schema.safeParse(transformed)
    if (!parsed.success) {
      errors.push({ fileName, issues: parsed.error.issues })
    }
  }

  return {
    label,
    total: rawDocs.length,
    passed: rawDocs.length - errors.length,
    errors,
  }
}

// === Report ===

/**
 * Format and print validation results to stdout
 * Returns true if all documents passed, false otherwise
 */
export const printReport = (results: ValidationResult[]): boolean => {
  console.log("Validating structured-json documents...\n")

  for (const r of results) {
    const status = r.errors.length === 0 ? "passed" : "FAILED"
    console.log(`  ${r.label}: ${r.passed}/${r.total} ${status}`)
  }

  const allErrors = results.flatMap((r) =>
    r.errors.map((e) => ({ label: r.label, ...e })),
  )

  if (allErrors.length > 0) {
    console.log("\nValidation errors:")
    for (const { label, fileName, issues } of allErrors) {
      console.log(`  ${label}/${fileName}:`)
      for (const issue of issues) {
        console.log(`    - ${issue.path.join(".")}: ${issue.message}`)
      }
    }
    console.log(`\nResult: FAIL (${allErrors.length} error${allErrors.length > 1 ? "s" : ""})`)

    return false
  }

  console.log("\nResult: PASS")

  return true
}

// === Main ===

const main = () => {
  const researchDir = getSourceDir("research")
  const researchVersionDir = getSourceDir("research-version")
  const datasetDir = getSourceDir("dataset")

  const results = [
    validateDocs(
      "Research",
      readJsonFilesFromDir(researchDir),
      EsResearchSchema,
      transformResearch,
    ),
    validateDocs(
      "Research Version",
      readJsonFilesFromDir(researchVersionDir),
      ResearchVersionSchema,
    ),
    validateDocs(
      "Dataset",
      readJsonFilesFromDir(datasetDir),
      EsDatasetSchema,
    ),
  ]

  const ok = printReport(results)
  if (!ok) {
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
