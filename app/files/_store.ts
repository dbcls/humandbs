/**
 * Reaching the store directly, for tests that need to arrange one.
 *
 * The store is the one thing the application does not own, so a test is allowed
 * to put an object into it the way anything else would. What it must not do is
 * stand in for the application's own reading of it — that is what is being
 * tested.
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { request } from "node:http"

import { loadConfig } from "~/config.server"

import type { Bucket } from "./store.server"

const { store } = loadConfig(process.env)

export const testStore = new S3Client({
  endpoint: store.endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey },
})

export async function putTestObject(bucket: Bucket, key: string, body = "x"): Promise<void> {
  await testStore.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: "application/octet-stream",
  }))
}

export async function keysUnder(bucket: Bucket, prefix: string): Promise<string[]> {
  const page = await testStore.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }))
  return (page.Contents ?? []).flatMap((object) => object.Key === undefined ? [] : [object.Key])
}

/** Takes a prefix away again, so one test does not arrange the next one. */
export async function clearPrefix(bucket: Bucket, prefix: string): Promise<void> {
  for (const key of await keysUnder(bucket, prefix)) {
    await testStore.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }
}

/**
 * Uses a presigned URL the way a browser would.
 *
 * The signature covers the host the URL names, and that name is the address the
 * site is served at — which inside the compose network resolves to nothing. The
 * connection is therefore made to the proxy while the Host header keeps the
 * name it was signed for, which is exactly what a browser sends. `fetch` cannot
 * do this: it ignores a Host header handed to it.
 */
export async function putThroughProxy(
  signed: string,
  body: string | Buffer,
  headers: Record<string, string> = {},
): Promise<number> {
  const url = new URL(signed)
  const payload = typeof body === "string" ? Buffer.from(body) : body

  return new Promise<number>((resolve, reject) => {
    const call = request({
      host: "proxy",
      port: 8080,
      method: "PUT",
      path: `${url.pathname}${url.search}`,
      headers: { "Host": url.host, "Content-Length": String(payload.byteLength), ...headers },
    }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    call.on("error", reject)
    call.end(payload)
  })
}
