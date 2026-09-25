/**
 * Row locks on a research and the rows that belong to it.
 *
 * **Every transaction that locks or writes these rows acquires them in one
 * order:** the `research` row, then `research_draft`, then `dataset` rows in id
 * order, then `label_pin` rows in id order, then `research_version`. A
 * transaction spanning several researches locks their rows in id order before
 * any of the rest. Two transactions that follow the order at most wait for each
 * other; one that locks a later row first and an earlier one after can
 * deadlock against another, and Postgres then aborts one of them.
 *
 * Writes lock rows implicitly, which is why the research row comes first even
 * for a transaction that only needs the research to stay: deleting a research
 * locks it and then every child row through the cascade, and inserting a row
 * that references a research, a draft or a dataset acquires a key-share lock on
 * the referenced row.
 */

import { asc, inArray, sql } from "drizzle-orm"

import type { Transaction } from "~/db/client.server"
import { research } from "~/db/schema"

/**
 * How strongly the research row is held.
 *
 * - `update` — the research itself is deleted.
 * - `no key update` — one transaction at a time for the research's versions
 *   (publish), while the rows that reference it can still be written.
 * - `key share` — the research is only kept from being deleted meanwhile.
 */
export type ResearchLock = "update" | "no key update" | "key share"

/** Locks the research row. False when there is no such research. */
export async function lockResearch(
  tx: Transaction,
  researchId: string,
  strength: ResearchLock,
): Promise<boolean> {
  const rows = await lockResearches(tx, [researchId], strength)
  return rows.length > 0
}

/** Locks several research rows in id order, returning the ids that exist. */
export async function lockResearches(
  tx: Transaction,
  researchIds: readonly string[],
  strength: ResearchLock,
): Promise<string[]> {
  if (researchIds.length === 0) return []
  const rows = await tx
    .select({ id: research.id })
    .from(research)
    .where(inArray(research.id, [...new Set(researchIds)]))
    .orderBy(asc(research.id))
    .for(strength)
  return rows.map((row) => row.id)
}

/** Locks every research row in id order, for a transaction that rewrites all of them. */
export async function lockAllResearches(tx: Transaction, strength: ResearchLock): Promise<void> {
  await tx.execute(sql`SELECT id FROM ${research} ORDER BY id FOR ${sql.raw(strength.toUpperCase())}`)
}
