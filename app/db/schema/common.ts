import { sql } from "drizzle-orm"
import { timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Surrogate keys everywhere. Nothing outward-facing — hum labels, version
 * numbers, dataset ids — is ever a primary key, because those are pins that can
 * be corrected, reused, or attached to a different identity.
 *
 * uuidv7 is built into Postgres 18 and orders by creation time, so an index on
 * the key stays dense as rows are inserted.
 */
export const primaryId = () => uuid().primaryKey().default(sql`uuidv7()`)

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
