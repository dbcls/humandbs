import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt, primaryId } from "./common"
import { dataset, research } from "./research"

export const labelKind = pgEnum("label_kind", ["hum", "dataset"])

/**
 * The pin ledger: which outward-facing label is attached to which identity.
 *
 * Both systems of label are here because the rule they follow is the same —
 * unique across primary and secondary alike, reusable once unpinned, warned
 * about when moved to a different identity. Version numbers follow the same
 * idea but are scoped to a research and carry a published state, so they are
 * pinned on `research_version` instead.
 *
 * One identity can hold several labels: one primary, the rest secondary. That
 * is what keeps old dataset ids resolvable after a research is renumbered —
 * they are cited in article prose, in submission forms, and in URL fragments,
 * none of which can be rewritten.
 *
 * Unpinning is a single operation. Nothing reserves a retired label, because
 * hum numbers originate as free text typed into an upstream system that has a
 * history of typos, which makes correction an everyday operation.
 */
export const labelPin = pgTable("label_pin", {
  id: primaryId(),
  kind: labelKind().notNull(),
  label: text().notNull(),
  researchId: uuid().references(() => research.id, { onDelete: "cascade" }),
  datasetId: uuid().references(() => dataset.id, { onDelete: "cascade" }),
  isPrimary: boolean().notNull(),
  createdAt: createdAt(),
}, (t) => [
  unique("label_pin_label_unique").on(t.kind, t.label),
  uniqueIndex().on(t.researchId).where(sql`${t.isPrimary}`),
  uniqueIndex().on(t.datasetId).where(sql`${t.isPrimary}`),
  check(
    "label_pin_subject_matches_kind",
    sql`(${t.kind} = 'hum' AND ${t.researchId} IS NOT NULL AND ${t.datasetId} IS NULL)
     OR (${t.kind} = 'dataset' AND ${t.datasetId} IS NOT NULL AND ${t.researchId} IS NULL)`,
  ),
])
