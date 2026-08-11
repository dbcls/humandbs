import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { createdAt, primaryId } from "./common"

/**
 * Who may administer the portal. This is deliberately not a Keycloak role: the
 * realm belongs to another organisation, so granting a role would be a request
 * to them, and a change of staff could not be handled the same day.
 *
 * The key is the Keycloak `sub`. `preferred_username` can change, and keying on
 * it would sever both the grant and the audit trail on a rename.
 */
export const adminUser = pgTable("admin_user", {
  id: primaryId(),
  keycloakSub: text().notNull().unique(),
  displayName: text().notNull(),
  createdAt: createdAt(),
})

/**
 * One signed-in browser.
 *
 * The session lives here rather than in the cookie, and the cookie carries
 * nothing but an unguessable value. Signing out therefore deletes a row and
 * takes effect at once, and nothing in the cookie can be mistaken for a
 * statement about what its holder may do — authorisation is derived per request
 * from `admin_user`.
 *
 * **The cookie value is stored as a hash.** Being able to read this table is not
 * the same as being able to impersonate the people in it.
 *
 * No access or refresh token is kept. The public API has no authentication and
 * there is no separate resource server, so nothing here would ever be sent
 * anywhere; the ID token is the exception, because ending the session at
 * Keycloak needs it as `id_token_hint`.
 *
 * The rows are disposable. Losing them signs everybody out and costs nothing
 * else, so they are outside what has to be backed up or migrated.
 */
export const session = pgTable("session", {
  id: primaryId(),
  tokenHash: text().notNull().unique(),
  keycloakSub: text().notNull(),
  displayName: text().notNull(),
  idToken: text().notNull(),
  /** Written at most once an hour, so reading a page is not a write. */
  lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  /** The absolute limit, set when the session is created and never extended. */
  expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [
  index().on(t.keycloakSub),
])
