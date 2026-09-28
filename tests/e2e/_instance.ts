import type { APIRequestContext, Page } from "@playwright/test"

/**
 * The rows a scenario needs, looked for on the instance it runs against.
 *
 * **Nothing here names a research or a dataset.** The scenarios run against the
 * compose in this repo, staging and production, which hold different rows; each
 * function reads the public API (or a public page, for what the API does not
 * return) and answers null when the instance has nothing that fits, which the
 * scenario reports as a skip.
 */

export interface ResearchHit {
  id: string
  version: number
  versions: { version: number }[]
  datasets: string[]
}

export interface DatasetHit {
  id: string
  research: string
  values: { key: string, terms?: { code: string }[] }[]
  dataVolume?: number
  fileFormats?: unknown[]
}

/** The hits of the first `pages` pages of a search. */
async function hits<T>(request: APIRequestContext, path: string, pages = 1): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= pages; page++) {
    const separator = path.includes("?") ? "&" : "?"
    const answer = await request.get(`${path}${separator}page=${page}`)
    if (!answer.ok()) break
    const { hits: found, pageCount } = await answer.json() as { hits: T[], pageCount: number }
    all.push(...found)
    if (page >= pageCount) break
  }
  return all
}

/** A research with more than one published version. */
export async function researchWithPastVersion(request: APIRequestContext): Promise<ResearchHit | null> {
  const found = await hits<ResearchHit>(request, "/api/research", 5)
  return found.find((one) => one.versions.length > 1) ?? null
}

/** A research that lists at least `count` JGA datasets, and those datasets. */
export async function researchWithJgads(
  request: APIRequestContext,
  count: number,
): Promise<{ id: string, jgads: string[] } | null> {
  const datasets = await hits<DatasetHit>(request, `/api/dataset?q=${encodeURIComponent("id:JGAD*")}`, 3)
  for (const research of new Set(datasets.map((one) => one.research))) {
    const { datasets: listed } = await (await request.get(`/api/research/${research}`)).json() as ResearchHit
    const jgads = listed.filter((id) => /^JGAD\d+$/.test(id))
    if (jgads.length >= count) return { id: research, jgads }
  }
  return null
}

/** A dataset of each kind the portal and the archive give an ID to. */
export async function firstDataset(request: APIRequestContext, prefix: "NHA" | "JGAD"): Promise<DatasetHit | null> {
  const found = await hits<DatasetHit>(request, `/api/dataset?q=${encodeURIComponent(`id:${prefix}*`)}`)
  return found[0] ?? null
}

/**
 * A dataset whose page shows a secondary ID, and that ID.
 *
 * **The API does not return secondary IDs**, only answers to them, so this reads
 * the dataset pages. Datasets the portal numbered (NHA) are where the old IDs
 * are: the migration made the IDs of the old portal their secondary ones.
 */
export async function datasetWithSecondaryId(
  request: APIRequestContext,
  page: Page,
): Promise<{ id: string, secondary: string, research: string } | null> {
  const found = await hits<DatasetHit>(request, `/api/dataset?q=${encodeURIComponent("id:NHA*")}`)
  for (const dataset of found.slice(0, 10)) {
    await page.goto(`/dataset/${dataset.id}`)
    const value = page.locator("dt", { hasText: /^Secondary ID$/ }).locator("xpath=following-sibling::dd[1]")
    if (await value.count() === 0) continue
    const secondary = (await value.first().innerText()).split("\n")[0]?.trim() ?? ""
    if (secondary !== "") return { id: dataset.id, secondary, research: dataset.research }
  }
  return null
}

/** A research whose every dataset is unrestricted-access. */
export async function unrestrictedResearch(request: APIRequestContext): Promise<string | null> {
  const open = await hits<DatasetHit>(
    request,
    `/api/dataset?q=${encodeURIComponent("access-criteria:unrestricted-access")}`,
    3,
  )
  const openIds = new Set(open.map((one) => one.id))
  for (const research of new Set(open.map((one) => one.research))) {
    const { datasets } = await (await request.get(`/api/research/${research}`)).json() as ResearchHit
    if (datasets.length > 0 && datasets.every((id) => openIds.has(id))) return research
  }
  return null
}

/**
 * A dataset whose unrestricted-access files run to more than one page of the
 * section, and how many there are.
 *
 * Looked for among the datasets that name file formats, since the formats of
 * a portal-numbered dataset come from the files linked to it.
 */
export async function datasetWithFilePages(
  request: APIRequestContext,
  perPage = 20,
): Promise<{ id: string, files: number } | null> {
  const found = await hits<DatasetHit>(request, `/api/dataset?q=${encodeURIComponent("id:NHA*")}`, 3)
  const datasets = found.filter((one) => (one.fileFormats?.length ?? 0) > 0).map((one) => one.id)
  let fewest: { id: string, files: number } | null = null
  // The fewest files over a page: a dataset can hold thousands.
  for (const id of datasets.slice(0, 20)) {
    const { files } = await (await request.get(`/api/dataset/${id}?includeFiles=true`)).json() as {
      files?: unknown[]
    }
    const count = files?.length ?? 0
    if (count > perPage && (fewest === null || count < fewest.files)) fewest = { id, files: count }
  }
  return fewest
}
