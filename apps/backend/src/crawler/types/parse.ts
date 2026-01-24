/**
 * Parse result type definitions (output of HTML parsing)
 */
import type { TextValue, UrlValue } from "./common"

/** Dataset information from summary table */
export interface RawDataset {
  datasetId: string | null
  typeOfData: string | null
  criteria: string | null
  releaseDate: string | null
}

/** Summary section of a detail page */
export interface RawSummary {
  aims: TextValue
  methods: TextValue
  targets: TextValue
  url: UrlValue[]
  datasets: RawDataset[]
  footers: TextValue[]
}

/** Molecular data table (one table per dataset) */
export interface RawMolecularData {
  /** Identifier text shown above the table (may include accessions) */
  id: TextValue
  /** Key-value map of table rows; value is normalized HTML or null for absent "-" */
  data: Record<string, TextValue | null>
  footers: TextValue[]
}

/** Grant information from data provider section */
export interface RawGrant {
  grantName: string | null
  projectTitle: string | null
  grantId: string[]
}

/** Data provider section */
export interface RawDataProvider {
  principalInvestigator: TextValue[]
  affiliation: TextValue[]
  projectName: TextValue[]
  projectUrl: UrlValue[]
  grants: RawGrant[]
}

/** Publication entry */
export interface RawPublication {
  title: string | null
  doi: string | null
  datasetIds: string[]
}

/** Controlled access user entry */
export interface RawControlledAccessUser {
  principalInvestigator: string | null
  affiliation: string | null
  country: string | null
  researchTitle: string | null
  datasetIds: string[]
  periodOfDataUse: string | null
}

/** Release entry from release page */
export interface RawRelease {
  humVersionId: string
  releaseDate: string
  content: string
  releaseNote?: TextValue
}

/** Complete parse result for a single humVersionId + lang */
export interface RawParseResult {
  title: string
  summary: RawSummary
  molecularData: RawMolecularData[]
  dataProvider: RawDataProvider
  publications: RawPublication[]
  controlledAccessUsers: RawControlledAccessUser[]
  releases: RawRelease[]
}
