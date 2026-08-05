import { sql } from "drizzle-orm"

import { getDb } from "~/db/client.server"
import { runHealthChecks } from "~/health.server"

export async function loader(): Promise<Response> {
  const report = await runHealthChecks(
    [{ name: "database", probe: () => getDb().execute(sql`select 1`) }],
    { onError: (name, error) => { console.error(`health check failed: ${name}`, error) } },
  )

  return Response.json(report, { status: report.ok ? 200 : 503 })
}
