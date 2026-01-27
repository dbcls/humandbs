/**
 * Base API client with caching
 */
import { existsSync, rmSync } from "fs"
import { join } from "path"

import { DEFAULT_API_DELAY_MS } from "@/crawler/config/urls"
import { getErrorMessage } from "@/crawler/utils/error"
import { getExternalCacheDir, ensureDir, readJson, writeJson } from "@/crawler/utils/io"
import { logger } from "@/crawler/utils/logger"

/**
 * Configuration for cached API client
 */
export interface CachedClientConfig {
  cacheDir: string
  getCacheKey: (id: string) => string
  delayMs?: number
  retries?: number
}

/**
 * Cached API response
 */
export interface CachedApiResponse<T> {
  found: boolean
  data: T | null
  cachedAt: string
}

/**
 * Cached API client interface
 */
export interface CachedApiClient<T> {
  get(id: string, useCache?: boolean): Promise<T | null>
  getMany(ids: string[], useCache?: boolean): Promise<Map<string, T | null>>
  clearCache(): void
}

/**
 * Delay execution
 */
const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

/**
 * Create a cached API client
 */
export const createCachedClient = <T>(
  config: CachedClientConfig,
  fetchFn: (id: string) => Promise<T | null>,
): CachedApiClient<T> => {
  const cacheDir = join(getExternalCacheDir(), config.cacheDir)
  const delayMs = config.delayMs ?? DEFAULT_API_DELAY_MS

  const getCachePath = (id: string): string => {
    const key = config.getCacheKey(id)
    return join(cacheDir, `${key}.json`)
  }

  const get = async (id: string, useCache = true): Promise<T | null> => {
    const cachePath = getCachePath(id)

    if (useCache) {
      const cached = readJson<CachedApiResponse<T>>(cachePath)
      if (cached) {
        logger.debug("Cache hit", { id, cacheDir: config.cacheDir })
        return cached.data
      }
    }

    ensureDir(cacheDir)

    try {
      const data = await fetchFn(id)
      const response: CachedApiResponse<T> = {
        found: data !== null,
        data,
        cachedAt: new Date().toISOString(),
      }
      writeJson(cachePath, response)
      logger.debug("Data fetched and cached", { id, found: data !== null })
      return data
    } catch (error) {
      logger.error("Failed to fetch data", { id, error: getErrorMessage(error) })
      return null
    }
  }

  const getMany = async (ids: string[], useCache = true): Promise<Map<string, T | null>> => {
    const results = new Map<string, T | null>()

    for (const id of ids) {
      const data = await get(id, useCache)
      results.set(id, data)

      if (delayMs > 0) {
        await delay(delayMs)
      }
    }

    return results
  }

  const clearCache = (): void => {
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true })
      logger.info("Cache directory deleted", { cacheDir })
    } else {
      logger.info("Cache directory does not exist", { cacheDir })
    }
  }

  return {
    get,
    getMany,
    clearCache,
  }
}
