/**
 * Creates the two buckets the file store is divided into.
 *
 * They are not created on demand, because which bucket an object is in is the
 * whole of its published state: a bucket that appears the first time something
 * is written to it would make "public" depend on the order of operations.
 *
 * Run once when a store is new. Running it again does nothing.
 */

import { CreateBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3"

import { loadConfig } from "~/config.server"
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from "~/files/box"

const { store } = loadConfig(process.env)

const client = new S3Client({
  endpoint: store.endpoint,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: store.accessKeyId, secretAccessKey: store.secretAccessKey },
})

const held = new Set(
  (await client.send(new ListBucketsCommand({}))).Buckets?.map((bucket) => bucket.Name) ?? [],
)

for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
  if (held.has(bucket)) {
    console.log(`${bucket} is already there`)
    continue
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }))
  console.log(`created ${bucket}`)
}

client.destroy()
