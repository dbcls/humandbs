/**
 * Normalized type definitions (output of normalization)
 */
import type { TextValue, CriteriaCanonical, PeriodOfDataUse, DatasetIdType } from "./common"
import type { RawDataset, RawDataProvider, RawParseResult } from "./parse"

/** Dataset IDs extracted from a molecular data row */
export interface ExtractedDatasetIds {
  /** All valid dataset IDs (after JGAS→JGAD expansion) */
  datasetIds: string[]
  /** Original JGAS IDs before expansion (for reference/debugging) */
  originalJgasIds: string[]
  /** IDs by type before JGAS expansion */
  idsByType: Partial<Record<DatasetIdType, string[]>>
}

/** Registry of valid dataset IDs for orphan detection */
export interface DatasetIdRegistry {
  /** All valid dataset IDs from molTable */
  validDatasetIds: string[]
  /** Mapping from datasetId to molData indices */
  datasetIdToMolDataIndices: Record<string, number[]>
}

/** Orphan reference detected during normalization */
export interface OrphanReference {
  type: "summary" | "publication" | "controlledAccessUser"
  datasetId: string
  context: string
}

/** Normalized dataset with array fields */
export interface NormalizedDataset extends Omit<RawDataset, "datasetId" | "criteria" | "releaseDate"> {
  datasetId: string[] | null
  criteria: CriteriaCanonical[] | null
  releaseDate: string[] | null
}

/** Normalized molecular data with possible array values */
export interface NormalizedMolecularData {
  id: TextValue
  data: Record<string, TextValue | TextValue[] | null>
  footers: TextValue[]
  /** Dataset IDs extracted from this row (JGAS expanded to JGAD) */
  extractedDatasetIds?: ExtractedDatasetIds
}

/** Normalized grant with nullable grantId */
export interface NormalizedGrant {
  grantName: string | null
  projectTitle: string | null
  grantId: string[] | null
}

/** Normalized controlled access user with structured periodOfDataUse */
export interface NormalizedControlledAccessUser {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: PeriodOfDataUse | null
}

/** Complete normalized parse result */
export interface NormalizedParseResult extends Omit<RawParseResult, "summary" | "molecularData" | "dataProvider" | "controlledAccessUsers"> {
  summary: Omit<RawParseResult["summary"], "datasets"> & {
    datasets: NormalizedDataset[]
  }
  molecularData: NormalizedMolecularData[]
  dataProvider: Omit<RawDataProvider, "grants"> & {
    grants: NormalizedGrant[]
  }
  controlledAccessUsers: NormalizedControlledAccessUser[]
  /** Registry of valid dataset IDs (populated after normalization) */
  datasetIdRegistry?: DatasetIdRegistry
  /** Orphan references detected during normalization */
  detectedOrphans?: OrphanReference[]
}
