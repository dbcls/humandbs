/**
 * Copies the old portal's files into the file store, as `copy.ts` plans.
 *
 * Run beside the store, with the old directories mounted read-only:
 *
 * - `HUMANDBS_COPY_SOURCE` — the directory the old portal served `/files/`
 *   from (default `/source/files`)
 * - `HUMANDBS_COPY_ASSETS` — its article assets, `public-files` (default
 *   `/source/public-files`)
 * - `HUMANDBS_COPY_CENSUS` — the census of the first (default
 *   `input/l12/file-census.json`)
 *
 * The files drafts link that only the old staging site held are read from
 * `input/l12/draft-files/` (`copy.ts` の `planDraftFiles`), and the files the
 * old site's pages linked outside any research — the committee's papers, the
 * forms of past guidelines — from `input/l12/site-files/`, kept at their old
 * paths under `common/` as the article assets are.
 *
 * **It can be stopped and run again.** A file already in the store at the same
 * size is left as it is, so a second run copies only what the first did not
 * finish. A file larger than one part goes up in parts, as the upload screen
 * sends it.
 *
 * **Run it after the database is loaded.** A private prefix is keyed by research
 * identity, which the load derives from the hum label, so loading again does not
 * move it. A private key under no research the plan knows is listed in the
 * report to be removed.
 *
 * `--dry-run` prints the plan and copies nothing.
 */

import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { sql } from "drizzle-orm"

import { loadConfig } from "~/config.server"
import { closePools, getDb } from "~/db/client.server"
import { MULTIPART_CONCURRENCY, MULTIPART_PART_SIZE, MULTIPART_THRESHOLD, PRIVATE_BUCKET } from "~/files/prefix"
import { contentTypeOf } from "~/files/content-types"

import { planAssets, planCopy, planDraftFiles, type PlannedCopy, type Census } from "./copy"

const INPUT = join(import.meta.dirname, "input", "l12")
const SOURCE = process.env.HUMANDBS_COPY_SOURCE ?? "/source/files"
const ASSETS = process.env.HUMANDBS_COPY_ASSETS ?? "/source/public-files"
const DRAFT_FILES = join(INPUT, "draft-files")
const SITE_FILES = join(INPUT, "site-files")
const DRY_RUN = process.argv.includes("--dry-run")
/** Files in flight at once; each large one also sends its parts in parallel. */
const FILES_IN_FLIGHT = 4

const { store } = loadConfig(process.env)
const client = new S3Client({
  endpoint: store.endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey },
})

function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort()
}

async function researchIds(): Promise<Map<string, string>> {
  const { rows } = await getDb().execute<{ label: string, research_id: string }>(sql`
    SELECT label, research_id FROM label_pin WHERE kind = 'hum'
  `)
  return new Map(rows.map((row) => [row.label, row.research_id]))
}

async function storedSize(one: PlannedCopy): Promise<number | null> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: one.bucket, Key: one.key }))
    return head.ContentLength ?? null
  } catch {
    return null
  }
}

async function inParallel<T>(items: readonly T[], width: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) {
      const item = items[next]
      next += 1
      if (item !== undefined) await work(item)
    }
  }))
}

async function put(path: string, one: PlannedCopy, size: number): Promise<void> {
  const ContentType = contentTypeOf(one.key)
  if (size <= MULTIPART_THRESHOLD) {
    await client.send(new PutObjectCommand({
      Bucket: one.bucket, Key: one.key, Body: createReadStream(path), ContentLength: size, ContentType,
    }))
    return
  }
  const { UploadId } = await client.send(new CreateMultipartUploadCommand({ Bucket: one.bucket, Key: one.key, ContentType }))
  if (UploadId === undefined) throw new Error(`${one.key}: the store opened no upload`)
  try {
    const count = Math.ceil(size / MULTIPART_PART_SIZE)
    const parts: { PartNumber: number, ETag: string }[] = []
    await inParallel(Array.from({ length: count }, (_x, i) => i), MULTIPART_CONCURRENCY, async (i) => {
      const start = i * MULTIPART_PART_SIZE
      const end = Math.min(size, start + MULTIPART_PART_SIZE) - 1
      const { ETag } = await client.send(new UploadPartCommand({
        Bucket: one.bucket,
        Key: one.key,
        UploadId,
        PartNumber: i + 1,
        Body: createReadStream(path, { start, end }),
        ContentLength: end - start + 1,
      }))
      if (ETag === undefined) throw new Error(`${one.key}: part ${i + 1} came back without an ETag`)
      parts.push({ PartNumber: i + 1, ETag })
    })
    parts.sort((a, b) => a.PartNumber - b.PartNumber)
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: one.bucket, Key: one.key, UploadId, MultipartUpload: { Parts: parts },
    }))
  } catch (error) {
    await client.send(new AbortMultipartUploadCommand({ Bucket: one.bucket, Key: one.key, UploadId })).catch(() => undefined)
    throw error
  }
}

/** Private keys that belong to no research the plan knows. */
async function strayPrivateKeys(plan: readonly PlannedCopy[]): Promise<string[]> {
  const planned = new Set(plan.filter((one) => one.bucket === PRIVATE_BUCKET).map((one) => one.key))
  const stray: string[] = []
  let token: string | undefined
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: PRIVATE_BUCKET, ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (object.Key !== undefined && !planned.has(object.Key)) stray.push(object.Key)
    }
    token = page.NextContinuationToken
  } while (token !== undefined)
  return stray
}

const census = JSON.parse(readFileSync(process.env.HUMANDBS_COPY_CENSUS ?? join(INPUT, "file-census.json"), "utf8")) as Census
const ids = await researchIds()
const plan = planCopy(census, (hum) => ids.get(hum))
const assets = existsSync(ASSETS) ? planAssets(filesUnder(ASSETS), (path) => statSync(join(ASSETS, path)).size) : []
const drafts = existsSync(DRAFT_FILES)
  ? planDraftFiles(filesUnder(DRAFT_FILES), (path) => statSync(join(DRAFT_FILES, path)).size, (hum) => ids.get(hum))
  : []
const siteFiles = existsSync(SITE_FILES) ? planAssets(filesUnder(SITE_FILES), (path) => statSync(join(SITE_FILES, path)).size) : []
const items = [
  ...assets.map((one) => ({ one, path: join(ASSETS, one.source) })),
  ...siteFiles.map((one) => ({ one, path: join(SITE_FILES, one.source) })),
  ...plan.copy.map((one) => ({ one, path: join(SOURCE, one.source) })),
  ...drafts.map((one) => ({ one, path: join(DRAFT_FILES, one.source) })),
]
// Two sources may not put a file on one key: one of them would be lost.
const keyed = new Map<string, string>()
for (const { one, path } of items) {
  const held = keyed.get(`${one.bucket}/${one.key}`)
  if (held !== undefined) throw new Error(`${path} and ${held} would both be ${one.bucket}/${one.key}`)
  keyed.set(`${one.bucket}/${one.key}`, path)
}

const total = items.reduce((sum, { one }) => sum + one.size, 0)
const droppedBytes = plan.dropped.reduce((sum, one) => sum + one.size, 0)
console.log(`copy ${items.length} files, ${total} B (assets ${assets.length}, site files ${siteFiles.length}, draft files ${drafts.length}); leave ${plan.dropped.length} files, ${droppedBytes} B`)
for (const bucket of ["files", "private"]) {
  const into = items.filter(({ one }) => one.bucket === bucket)
  console.log(`  ${bucket}: ${into.length} files, ${into.reduce((sum, { one }) => sum + one.size, 0)} B`)
}

const report = { copied: [] as string[], skipped: [] as string[], missing: [] as string[], resized: [] as string[], failed: [] as string[] }
if (!DRY_RUN) {
  let done = 0
  let bytes = 0
  const started = Date.now()
  await inParallel(items, FILES_IN_FLIGHT, async ({ one, path }) => {
    const where = `${one.bucket}/${one.key}`
    try {
      if (!existsSync(path)) {
        report.missing.push(path)
        return
      }
      const size = statSync(path).size
      if (size !== one.size) report.resized.push(`${path}: census ${one.size} B, now ${size} B`)
      if (await storedSize(one) === size) {
        report.skipped.push(where)
      } else {
        await put(path, one, size)
        report.copied.push(where)
      }
      done += 1
      bytes += size
      const seconds = (Date.now() - started) / 1000
      console.log(`[${done}/${items.length}] ${(bytes / 1e9).toFixed(1)}/${(total / 1e9).toFixed(1)} GB ${(bytes / 1e6 / seconds).toFixed(0)} MB/s ${where}`)
    } catch (error) {
      report.failed.push(`${where}: ${error instanceof Error ? error.message : String(error)}`)
      console.log(`FAILED ${where}`)
    }
  })
  const stray = await strayPrivateKeys(items.map(({ one }) => one))
  writeFileSync(join(INPUT, "out", "copy-report.json"), `${JSON.stringify({ ...report, stray }, null, 2)}\n`)
  console.log(`copied ${report.copied.length}, already there ${report.skipped.length}, missing ${report.missing.length}, `
    + `resized ${report.resized.length}, failed ${report.failed.length}, stray private ${stray.length}`)
}

client.destroy()
await closePools()
