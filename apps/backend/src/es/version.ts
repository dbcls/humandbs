/**
 * Version string arithmetic.
 *
 * Document ids in every index end with a version (`{humId}-{version}`,
 * `{datasetId}-{version}`), so the parsing lives next to the schemas that
 * define them and stays free of API-layer dependencies — ingest and the API
 * both need it. `src/api/utils/version.ts` re-exports these for API callers.
 */

/** Parse version number from version string (e.g., "v2" -> 2) */
export const parseVersionNum = (v: string): number => {
  const match = /^v(\d+)$/.exec(v)
  if (!match) {
    throw new Error(`Invalid version format: "${v}"`)
  }

  return parseInt(match[1], 10)
}

/**
 * Extract the version part from a humVersionId (e.g., "hum0006-v8" -> "v8").
 * Returns null if the id does not match the expected shape.
 */
export const parseVersionFromHumVersionId = (humVersionId: string): string | null => {
  const idx = humVersionId.lastIndexOf("-")
  if (idx <= 0) return null // must have a non-empty humId prefix
  const ver = humVersionId.slice(idx + 1)
  return /^v\d+$/.test(ver) ? ver : null
}

/**
 * Non-owner/admin visibility ceiling: a Dataset (or ResearchVersion) whose
 * humVersionId points to a version *after* the parent Research's
 * `latestVersion` (i.e. a draft) must be hidden.
 *
 * - owner/admin: always visible
 * - parent has no latestVersion (N-draft): always hidden for non-owner/admin
 * - otherwise: visible iff `parseVersionNum(childVersion) <= parseVersionNum(latestVersion)`
 *
 * Returns false when the humVersionId cannot be parsed (defensive; unknown-shape
 * ids are treated as hidden for non-owner/admin).
 */
export const isHumVersionAccessible = (
  humVersionId: string,
  parentLatestVersion: string | null,
  isOwnerOrAdmin: boolean,
): boolean => {
  if (isOwnerOrAdmin) return true
  if (parentLatestVersion === null) return false
  const childVer = parseVersionFromHumVersionId(humVersionId)
  if (childVer === null) return false
  return parseVersionNum(childVer) <= parseVersionNum(parentLatestVersion)
}
