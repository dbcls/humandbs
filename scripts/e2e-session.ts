/**
 * A signed-in session for the scenarios that need one, made without going
 * through Keycloak.
 *
 * The e2e run drives a browser against an instance from the outside, and the
 * one thing it cannot do from there is sign in: the identity provider is a
 * third party with its own login page, and a scenario that typed into it would
 * be testing that page. So the session is made here, where the database is, and
 * handed to the browser as a cookie (`docs/testing.md` の「e2e」).
 *
 *   npm run e2e:session          # prints the cookie value
 *   npm run e2e:session -- clean # takes the session and the access back out
 *
 * **The subject is not a real person's.** It is granted administrator access
 * for as long as the session lasts, so it belongs on an instance being tested
 * and nowhere else — `clean` is what takes it off again.
 */

import { eq } from "drizzle-orm"

import { grantAdmin, revokeAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession } from "~/auth/session.server"
import { closePools, getDb } from "~/db/client.server"
import { session } from "~/db/schema"

const PERSON = { sub: "e2e-curator", name: "e2e curator", idToken: "none" }

const db = getDb()

if (process.argv[2] === "clean") {
  await db.delete(session).where(eq(session.keycloakSub, PERSON.sub))
  await revokeAdmin(db, BOOTSTRAP_ACTOR, PERSON.sub)
  console.error(`revoked ${PERSON.sub}`)
} else {
  await grantAdmin(db, BOOTSTRAP_ACTOR, PERSON)
  // The value alone on stdout, so the caller can put it straight into the
  // variable the e2e run reads.
  console.log(await createSession(db, PERSON))
}

await closePools()
