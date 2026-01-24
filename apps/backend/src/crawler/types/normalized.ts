/**
 * Normalized type definitions (output of normalization)
 */
import type { TextValue, CriteriaCanonical, PeriodOfDataUse } from "./common"
import type { RawDataset, RawDataProvider, RawParseResult } from "./parse"

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
}
