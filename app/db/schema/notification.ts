import { sql } from "drizzle-orm"
import { check, integer, pgTable, timestamp } from "drizzle-orm/pg-core"

/**
 * How far the Slack notification has read the comments, the button presses
 * and the event log. **One row**: everything written before `readUntil` has
 * been sent, or was written while no webhook was configured and is never sent.
 *
 * The row is also the lock. A notification claims it with `FOR UPDATE SKIP
 * LOCKED` and moves `readUntil` only after Slack has accepted the message, so
 * several application processes send each thing once, and a message Slack
 * refused is sent again with whatever has happened since.
 */
export const slackNotification = pgTable("slack_notification", {
  id: integer().primaryKey().default(1),
  readUntil: timestamp({ withTimezone: true }).notNull(),
}, (t) => [
  check("slack_notification_one_row", sql`${t.id} = 1`),
])
