/**
 * Fills the `common/` box with the images and documents articles point at.
 *
 * The bodies are not in the repository. They are fetched from the portal the
 * development data came from and left under `migration/input/` (git-ignored),
 * so a second run reads what is there and does not go out; a hand-placed copy
 * under the same name is used as it stands, which is how an environment with no
 * way out runs this at all. This is the arrangement the ICD10 dictionary uses.
 *
 * **What is fetched is what the content refers to.** The list is read out of the
 * database rather than written down here, so an article that starts pointing at
 * something else brings it along on the next run — and nothing is carried that
 * no article asks for.
 *
 * **The content type is written onto the object.** The store guesses from the
 * body when a PUT carries none, and the proxy decides between showing a file and
 * downloading it by what the store answers with (`docker/nginx/default.conf`),
 * so an image put without one would arrive as a download. An extension this does
 * not know becomes `application/octet-stream`, which the proxy sends as an
 * attachment — the safe side for anything that might hold markup.
 *
 * Run at setup, after the development data is loaded. Running it again replaces
 * what is there.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { sql } from "drizzle-orm"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, extname, join } from "node:path"

import { loadConfig } from "~/config.server"
import { closePools, getDb } from "~/db/client.server"
import { COMMON_BOX, PUBLIC_BUCKET } from "~/files/box"

/** Where the portal these files still live on serves them from. */
const ORIGIN = process.env.HUMANDBS_LEGACY_ORIGIN ?? "https://humandbs.dbcls.jp"
const LEGACY_PREFIX = "/public-files/"

/** Kept beside the other inputs the development data is built from. */
const LOCAL_ROOT = join(import.meta.dirname, "..", "migration", "input", "public-files")

/**
 * What the proxy is allowed to show inline is decided by these: an image or a
 * PDF is shown, everything else is downloaded. SVG is deliberately absent —
 * it is markup, and an inline one would run on the portal's own origin.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
}

const { store } = loadConfig(process.env)

const client = new S3Client({
  endpoint: store.endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey },
})

/**
 * Every `common/` file the stored content points at.
 *
 * The reference is written into the body as a URL, so it is read back out of
 * the text of the JSON. Anything a link or an image can be written in ends the
 * match: a quote, a bracket, a space.
 */
async function referenced(): Promise<string[]> {
  const db = getDb()
  const { rows } = await db.execute<{ path: string }>(sql`
    with bodies as (
      select content::text as body from document_content
      union all select content::text from news_content
      union all select content::text from content_snapshot
      union all select content::text from dataset_content
    )
    select distinct match[1] as path
    from bodies, regexp_matches(bodies.body, '/files/common/[^"()\\ ]+', 'g') as match
    order by 1
  `)
  return rows.map((row) => row.path.slice(`/files/${COMMON_BOX}/`.length))
}

/** The body, from what was kept last time or from the portal that still has it. */
async function bodyOf(name: string): Promise<Buffer> {
  const local = join(LOCAL_ROOT, name)
  try {
    return readFileSync(local)
  } catch {
    const from = `${ORIGIN}${LEGACY_PREFIX}${name.split("/").map(encodeURIComponent).join("/")}`
    const response = await fetch(from)
    if (!response.ok) throw new Error(`${from} answered ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    mkdirSync(dirname(local), { recursive: true })
    writeFileSync(local, body)
    return body
  }
}

const names = await referenced()
console.log(`${names.length} files are referred to`)

let carried = 0
const missing: string[] = []

for (const name of names) {
  try {
    const body = await bodyOf(name)
    await client.send(new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: `${COMMON_BOX}/${name}`,
      Body: body,
      ContentType: CONTENT_TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
    }))
    carried += 1
    console.log(`  ${name} (${body.byteLength} B)`)
  } catch (error) {
    missing.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`carried ${carried}/${names.length} into ${PUBLIC_BUCKET}/${COMMON_BOX}/`)
for (const line of missing) console.log(`  missing ${line}`)

client.destroy()
await closePools()
