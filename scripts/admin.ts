/**
 * Granting and revoking administrator access from the command line.
 *
 * This is the only way the first administrator can exist: access is granted by
 * `sub` from the management area, and reaching that area needs access. The same
 * path seeds a fresh development database and the real one at cutover.
 *
 * Whoever runs this has the database credentials, so there is nobody to
 * authorise. The events it writes carry the reserved bootstrap actor, because no
 * signed-in person caused them.
 */

import { grantAdmin, listAdmins, revokeAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { closePools, getDb } from "~/db/client.server"

const USAGE = `usage:
  npm run admin:list
  npm run admin:grant  -- <keycloak-sub> [display name]
  npm run admin:revoke -- <keycloak-sub>

A signed-in person's subject is shown on /admin.`

const [command, subject, ...nameParts] = process.argv.slice(2)
const db = getDb()

if (command === "list") {
  const admins = await listAdmins(db)
  if (admins.length === 0) {
    console.log("no administrators")
  }
  for (const admin of admins) {
    console.log(`${admin.sub}\t${admin.name}\t${admin.since.toISOString()}`)
  }
} else if (command === "grant" && subject !== undefined) {
  const name = nameParts.length > 0 ? nameParts.join(" ") : subject
  const granted = await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: subject, name })
  console.log(granted ? `granted ${subject}` : `${subject} was already an administrator`)
} else if (command === "revoke" && subject !== undefined) {
  const revoked = await revokeAdmin(db, BOOTSTRAP_ACTOR, subject)
  console.log(revoked ? `revoked ${subject}` : `${subject} was not an administrator`)
} else {
  console.error(USAGE)
  process.exitCode = 1
}

await closePools()
