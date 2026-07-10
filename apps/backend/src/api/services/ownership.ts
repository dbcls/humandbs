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

// Integration tests run inside the backend process, so they share this module's
// cache. Seeding lets ownership be granted without inserting `nbdc_application`
// rows into the shared JGA DB. `lastRefreshedAt` is bumped so `ensureCache`
// won't refresh from JGA DB (which lacks the test humId) and drop the seed.
export const seedOwnershipForTest = (
  entries: { humId: string; username: string }[],
): void => {
  for (const { humId, username } of entries) {
    const owners = humIdToOwners.get(humId) ?? []
    if (!owners.includes(username)) humIdToOwners.set(humId, [...owners, username])
    const hums = usernameToHumIds.get(username) ?? []
    if (!hums.includes(humId)) usernameToHumIds.set(username, [...hums, humId])
  }
  lastRefreshedAt = Date.now()
}

export const unseedOwnershipForTest = (
  entries: { humId: string; username: string }[],
): void => {
  for (const { humId, username } of entries) {
    const owners = (humIdToOwners.get(humId) ?? []).filter(u => u !== username)
    if (owners.length === 0) humIdToOwners.delete(humId)
    else humIdToOwners.set(humId, owners)
    const hums = (usernameToHumIds.get(username) ?? []).filter(h => h !== humId)
    if (hums.length === 0) usernameToHumIds.delete(username)
    else usernameToHumIds.set(username, hums)
  }
}

/**
 * Remove every seeded owner for a humId. Used by integration cleanup
 * (`purgeResearch`) so that recycled humIds don't carry ownership from a
 * previously purged Research.
 */
export const unseedAllOwnersForHumIdTest = (humId: string): void => {
  const owners = humIdToOwners.get(humId) ?? []
  if (owners.length === 0) return
  unseedOwnershipForTest(owners.map(username => ({ humId, username })))
}
