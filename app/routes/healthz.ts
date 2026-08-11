/**
 * Every service the app cannot run without, and 503 if any one of them is down
 * ([development.md](../../docs/development.md)). The store is here as well as
 * the database: a published file lives in it, so an app that cannot reach it is
 * not serving the site even if every page still renders.
 */

import { sql } from "drizzle-orm"

import { getDb } from "~/db/client.server"
import { pingStore } from "~/files/store.server"
import { runHealthChecks } from "~/health.server"

export async function loader(): Promise<Response> {
  const report = await runHealthChecks(
    [
      { name: "database", probe: () => getDb().execute(sql`select 1`) },
      { name: "storage", probe: pingStore },
    ],
    { onError: (name, error) => { console.error(`health check failed: ${name}`, error) } },
  )

  return Response.json(report, { status: report.ok ? 200 : 503 })
}
