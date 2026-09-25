/**
 * Fills in the review-screen states `db:load-dev-data` has no reason to
 * produce on its own: open comments, review presses, unsettled and untranslated fields,
 * and a dataset nobody has pinned an accession to yet.
 *
 * Idempotent (`~/admin/seed-dev-review.server`) — run again after
 * `db:load-dev-data`, which replaces the research these drafts hang off.
 *
 * Run at `docker compose exec app npm run db:seed-review`.
 */

import { seedDevReviewData } from "~/admin/seed-dev-review.server"
import { closePools, getDb } from "~/db/client.server"

const result = await seedDevReviewData(getDb())
console.log(JSON.stringify(result, null, 2))
await closePools()
