/**
 * TTL-based in-memory Map cache.
 *
 * Simple bounded-lifetime cache for values that are safe to hold in a single
 * process (per-request DDBJ Search lookups, dblink resolution results, etc.).
 * `get` transparently evicts expired entries. Consumers pick their own TTL
 * from `CACHE_TTL`.
 */
interface CacheEntry<T> {
  value: T
  expiry: number
}

export class TtlMapCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>()
  private readonly ttl: number

  constructor(ttl: number) {
    this.ttl = ttl
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiry) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, expiry: Date.now() + this.ttl })
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
