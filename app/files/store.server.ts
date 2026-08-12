/**
 * The only module that talks to the file store.
 *
 * **The bytes of an upload never pass through here.** A browser is handed a URL
 * this module signed and puts straight to the store, which is why the size and
 * the content type are part of the signature: that is the whole of what can be
 * imposed on a transfer the application does not see (docs/data-model.md の
 * 「ファイル」).
 *
 * Two clients rather than one. The SDK writes a checksum of an empty body into
 * a presigned URL by default, and a PUT against it then fails with `BadDigest`
 * without exception; turning the checksum off is only right for the signing
 * side, because on the path where bytes do pass through the application a
 * checksum is worth having.
 *
 * Nothing here decides what should be where. That is `jobs.server.ts`.
 */

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { loadConfig, publicOrigin } from "~/config.server"

import { PRIVATE_BUCKET, PUBLIC_BUCKET, type StoredNode } from "./box"

/** How long a signature a browser is about to use stays good for. */
const UPLOAD_TTL_SECONDS = 60 * 60

/**
 * The dev server re-evaluates modules on every change, so the clients live on
 * `globalThis` for the same reason the database pools do.
 */
const globalForStore = globalThis as typeof globalThis & {
  humandbsStore?: S3Client
  humandbsSigner?: S3Client
}

function clientOptions() {
  const { store } = loadConfig(process.env)
  return {
    endpoint: store.endpoint,
    region: "us-east-1",
    // SeaweedFS addresses buckets by path; a virtual-host style request would
    // resolve a hostname that does not exist inside the compose network.
    forcePathStyle: true,
    credentials: { accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey },
  }
}

function getStore(): S3Client {
  globalForStore.humandbsStore ??= new S3Client(clientOptions())
  return globalForStore.humandbsStore
}

/**
 * The client whose signatures a browser uses. It differs from the other in two
 * ways, and both are load-bearing.
 *
 * **`WHEN_REQUIRED` is what makes a presigned PUT work at all** — the default
 * embeds the CRC32 of an empty body in the query string, and the store then
 * rejects every upload as a bad digest.
 *
 * **The endpoint is the site's own origin, not the store's.** The store's port
 * is not published, so a browser reaches it through the front proxy; a
 * signature covers the host it was made for, and the proxy passes that host on
 * unchanged, so the store verifies what the browser actually sent.
 */
function getSigner(): S3Client {
  const config = loadConfig(process.env)
  globalForStore.humandbsSigner ??= new S3Client({
    ...clientOptions(),
    endpoint: publicOrigin(config.auth),
    requestChecksumCalculation: "WHEN_REQUIRED",
  })
  return globalForStore.humandbsSigner
}

export type Bucket = typeof PUBLIC_BUCKET | typeof PRIVATE_BUCKET

export interface ObjectRef {
  bucket: Bucket
  key: string
}

/**
 * Whether the store answers for both buckets.
 *
 * **Both, because a bucket is the published state.** A store that answers for
 * one of them can neither publish a file nor take one back, and a missing
 * bucket is not created as a side effect of writing to it — so a health check
 * that only proved the endpoint is up would pass on a store the app cannot use.
 */
export async function pingStore(): Promise<void> {
  await Promise.all([PUBLIC_BUCKET, PRIVATE_BUCKET].map(async (bucket) => {
    await getStore().send(new HeadBucketCommand({ Bucket: bucket }))
  }))
}

/**
 * Everything under a prefix, with the prefix stripped off.
 *
 * No delimiter is passed, so a key with a separator in it comes back as a name
 * with a separator in it. That is deliberate: `common/dac/DAC_summary-1.pdf` is
 * one file to a reader, and hiding it behind a folder the box has no other
 * notion of would take it out of the listing.
 */
export async function listPrefix(bucket: Bucket, prefix: string): Promise<StoredNode[]> {
  const nodes: StoredNode[] = []
  let token: string | undefined

  do {
    const page = await getStore().send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token,
    }))
    for (const object of page.Contents ?? []) {
      const key = object.Key
      if (key?.startsWith(prefix) !== true) continue
      const name = key.slice(prefix.length)
      // The store reports the prefix itself when something created it as a
      // directory placeholder. It is not a file.
      if (name === "") continue
      nodes.push({
        name,
        size: object.Size ?? 0,
        updatedAt: (object.LastModified ?? new Date(0)).toISOString(),
      })
    }
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined
  } while (token !== undefined)

  return nodes
}

export async function objectExists(ref: ObjectRef): Promise<boolean> {
  try {
    await getStore().send(new HeadObjectCommand({ Bucket: ref.bucket, Key: ref.key }))
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

/**
 * Whether the store said "not there" rather than "not allowed" or "not now".
 *
 * The private bucket answers 403 for an absent object as well as a present one,
 * but that is what an anonymous reader sees; a request carrying credentials
 * gets 404. Anything else has to keep the job alive so it is retried.
 */
function isMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const named = error as { name?: string, $metadata?: { httpStatusCode?: number } }
  if (named.$metadata?.httpStatusCode === 404) return true
  return named.name === "NotFound" || named.name === "NoSuchKey"
}

/**
 * A copy across buckets. **This moves the actual bytes** — roughly a second per
 * half gigabyte — and takes as much disk again while it runs, which is why the
 * caller is a job and not a request.
 */
export async function copyObject(from: ObjectRef, to: ObjectRef): Promise<void> {
  await getStore().send(new CopyObjectCommand({
    Bucket: to.bucket,
    Key: to.key,
    CopySource: `/${from.bucket}/${encodeURI(from.key)}`,
  }))
}

export async function deleteObject(ref: ObjectRef): Promise<void> {
  await getStore().send(new DeleteObjectCommand({ Bucket: ref.bucket, Key: ref.key }))
}

/**
 * A URL that accepts exactly one file: this key, this type, this many bytes.
 *
 * All three are in the signature, so a client that sends a different type, no
 * type, or a body of a different length is refused by the store rather than by
 * anything the application could forget to check.
 */
export async function presignPut(
  ref: ObjectRef,
  file: { contentType: string, size: number },
): Promise<string> {
  return getSignedUrl(
    getSigner(),
    new PutObjectCommand({
      Bucket: ref.bucket,
      Key: ref.key,
      ContentType: file.contentType,
      ContentLength: file.size,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
  )
}

export interface MultipartUpload {
  uploadId: string
  /** One signed URL per part, in order. Part numbers start at 1. */
  urls: string[]
}

/**
 * Begin an upload in parts and sign each of them.
 *
 * Starting and finishing stay here because they need the credentials; only the
 * parts are signed away. The content type is fixed at the start and lands on
 * the finished object, so the same guarantee holds as for a single PUT — except
 * for the length, which no part carries and the store therefore cannot pin.
 */
export async function beginMultipart(
  ref: ObjectRef,
  file: { contentType: string, partCount: number },
): Promise<MultipartUpload> {
  const created = await getStore().send(new CreateMultipartUploadCommand({
    Bucket: ref.bucket,
    Key: ref.key,
    ContentType: file.contentType,
  }))
  const uploadId = created.UploadId
  if (uploadId === undefined) throw new Error("the store began no upload")

  const urls = await Promise.all(
    Array.from({ length: file.partCount }, (_, index) =>
      getSignedUrl(
        getSigner(),
        new UploadPartCommand({
          Bucket: ref.bucket,
          Key: ref.key,
          UploadId: uploadId,
          PartNumber: index + 1,
        }),
        { expiresIn: UPLOAD_TTL_SECONDS },
      )),
  )
  return { uploadId, urls }
}

export async function completeMultipart(
  ref: ObjectRef,
  uploadId: string,
  parts: readonly { partNumber: number, etag: string }[],
): Promise<void> {
  await getStore().send(new CompleteMultipartUploadCommand({
    Bucket: ref.bucket,
    Key: ref.key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: [...parts]
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
    },
  }))
}

export async function abortMultipart(ref: ObjectRef, uploadId: string): Promise<void> {
  await getStore().send(new AbortMultipartUploadCommand({
    Bucket: ref.bucket,
    Key: ref.key,
    UploadId: uploadId,
  }))
}
