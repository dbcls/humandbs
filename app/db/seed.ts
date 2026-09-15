/**
 * Seeding published rows in the database tests.
 *
 * **A version carries the description of every dataset it lists**, so there is
 * no separate place to write a description into before publishing one — it is
 * handed in here and folded into the version, the same shape a publish leaves
 * behind. Tests that only need a research to exist publicly say so in one call
 * rather than assembling the rows themselves, which is what keeps them from
 * drifting apart when the shape moves.
 */

import { emptyDatasetContent, emptyResearchContent } from "~/content/empty"
import type { DatasetContent, ResearchContent, VersionContent } from "~/content/types"

import type { Executor } from "./client.server"
import { dataset, labelPin, research, researchVersion } from "./schema"

function one<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

/** A research identity with its hum label pinned. */
export async function seedResearch(db: Executor, humLabel: string): Promise<string> {
  const { id } = one(await db.insert(research).values({}).returning({ id: research.id }))
  await db.insert(labelPin).values({ kind: "hum", label: humLabel, researchId: id, isPrimary: true })
  return id
}

/** A dataset identity with its accession pinned. It carries no description. */
export async function seedDataset(
  db: Executor,
  researchId: string,
  label: string,
): Promise<string> {
  const { id } = one(await db.insert(dataset).values({ researchId }).returning({ id: dataset.id }))
  await db.insert(labelPin).values({ kind: "dataset", label, datasetId: id, isPrimary: true })
  return id
}

/** The body of a version, with the descriptions it lists written into it. */
export function versionContent(
  datasets: readonly { datasetId: string, content?: DatasetContent }[] = [],
  body: Partial<ResearchContent> = {},
): VersionContent {
  const { datasetIds, ...rest } = { ...emptyResearchContent(), ...body }
  void datasetIds
  return {
    ...rest,
    datasets: datasets.map((row) => ({
      datasetId: row.datasetId,
      ...(row.content ?? emptyDatasetContent()),
    })),
  }
}

/** A published version, as a publish would have left it. */
export async function seedVersion(db: Executor, options: {
  researchId: string
  number: number
  releaseDate?: string
  datasets?: readonly { datasetId: string, content?: DatasetContent }[]
  body?: Partial<ResearchContent>
}): Promise<string> {
  const { id } = one(await db.insert(researchVersion).values({
    researchId: options.researchId,
    number: options.number,
    releaseDate: options.releaseDate ?? "2020-01-01",
    content: versionContent(options.datasets, options.body),
  }).returning({ id: researchVersion.id }))
  return id
}
