import { CACHE_TTL } from "@/api/constants"
import { fetchAllOwnership } from "@/api/db-client/ownership"

let humIdToOwners = new Map<string, string[]>()
let usernameToHumIds = new Map<string, string[]>()
let lastRefreshedAt = 0

const isCacheValid = (): boolean =>
  humIdToOwners.size > 0 && Date.now() - lastRefreshedAt < CACHE_TTL.OWNERSHIP

const isCacheStale = (): boolean =>
  humIdToOwners.size > 0 && Date.now() - lastRefreshedAt < CACHE_TTL.OWNERSHIP * 2

export const refreshOwnershipCache = async (): Promise<void> => {
  const rows = await fetchAllOwnership()

  const byHumId = new Map<string, Set<string>>()
  const byUsername = new Map<string, Set<string>>()

  for (const { hum_id, username } of rows) {
    let humSet = byHumId.get(hum_id)
    if (!humSet) {
      humSet = new Set()
      byHumId.set(hum_id, humSet)
    }
    humSet.add(username)

    let userSet = byUsername.get(username)
    if (!userSet) {
      userSet = new Set()
      byUsername.set(username, userSet)
    }
    userSet.add(hum_id)
  }

  humIdToOwners = new Map(
    [...byHumId.entries()].map(([k, v]) => [k, [...v]]),
  )
  usernameToHumIds = new Map(
    [...byUsername.entries()].map(([k, v]) => [k, [...v]]),
  )
  lastRefreshedAt = Date.now()
}

const ensureCache = async (): Promise<void> => {
  if (isCacheValid()) return
  try {
    await refreshOwnershipCache()
  } catch {
    if (isCacheStale()) return
    throw new Error("Ownership cache unavailable: JGA DB unreachable and no stale cache")
  }
}

export const getOwnerUsernames = async (humId: string): Promise<string[]> => {
  await ensureCache()
  return humIdToOwners.get(humId) ?? []
}

export const getOwnedHumIds = async (username: string): Promise<string[]> => {
  await ensureCache()
  return usernameToHumIds.get(username) ?? []
}

export const isOwner = async (username: string, humId: string): Promise<boolean> => {
  const owners = await getOwnerUsernames(humId)
  return owners.includes(username)
}

export const resetOwnershipCacheForTest = (): void => {
  humIdToOwners = new Map()
  usernameToHumIds = new Map()
  lastRefreshedAt = 0
}
