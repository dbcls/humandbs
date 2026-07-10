/**
 * Route-facing helper for populating `parentJgaStudyId` on dataset responses.
 *
 * Guards two concerns the underlying fetcher intentionally doesn't:
 *  1. Non-JGAD dataset IDs skip the DDBJ round trip entirely (nothing to
 *     look up — dblink for non-JGAD accessions returns nothing useful here).
 *  2. Any error from DDBJ Search is absorbed and returned as `null` so the
 *     dataset response itself stays 200. Distribution failures follow the
 *     same pattern (`getDistributionSafe`).
 */
import { fetchJgaParentStudyId } from "@/api/external/ddbj-search/jga-resources"
import { logger } from "@/api/logger"

const isJgaDatasetId = (datasetId: string): boolean => datasetId.startsWith("JGAD")

export const getParentJgaStudyIdSafe = async (
  datasetId: string,
  requestId?: string,
): Promise<string | null> => {
  if (!isJgaDatasetId(datasetId)) return null

  try {
    return await fetchJgaParentStudyId(datasetId, { requestId })
  } catch (err) {
    logger.warn("Failed to resolve parent JGA study", {
      datasetId,
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
