/**
 * Every service the app cannot run without, and 503 if any one of them is down.
 * The store is here as well as the database: a published file is kept in it, so
 * an app that cannot reach it is not serving the site even if every page
 * still renders.
 *
 * **The commit being served is in the answer too**, so that whoever watches
 * the site can tell which deploy is up without logging in to the host.
 */

import { sql } from "drizzle-orm"

import { getDb } from "~/db/client.server"
import { pingStore } from "~/files/store.server"
import { runHealthChecks } from "~/health.server"
import { appVersion } from "~/version.server"

export async function loader(): Promise<Response> {
  const report = await runHealthChecks(
    [
      { name: "database", probe: () => getDb().execute(sql`select 1`) },
      { name: "storage", probe: pingStore },
    ],
    { onError: (name, error) => { console.error(`health check failed: ${name}`, error) } },
  )

  return Response.json({ ...report, version: appVersion() }, { status: report.ok ? 200 : 503 })
}
