import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { closePools, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from "~/files/box"

/**
 * `/healthz` against the real database, with only the S3 client faked
 * (docs/testing.md の mock の境界). The database probe is left real: what is
 * under test here is the storage side and the wiring between the two
 * (docs/development.md の「1 つでも落ちていれば 503」).
 */

const seenBuckets: string[] = []
let downBucket: string | null = null

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  class FakeS3Client {
    send(command: unknown): Promise<unknown> {
      if (command instanceof actual.HeadBucketCommand) {
        const bucket = command.input.Bucket ?? ""
        seenBuckets.push(bucket)
        if (bucket === downBucket) return Promise.reject(new Error("bucket unreachable"))
        return Promise.resolve({})
      }
      return Promise.reject(new Error("this test only sends HeadBucketCommand"))
    }
  }
  return { ...actual, S3Client: FakeS3Client }
})

const { loader } = await import("./healthz")

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  seenBuckets.length = 0
  downBucket = null
})

afterAll(async () => {
  await closePools()
})

describe("the healthz loader", () => {
  it("answers 503 when the public bucket does not answer", async () => {
    downBucket = PUBLIC_BUCKET

    const response = await loader()

    expect(response.status).toBe(503)
  })

  it("answers 503 when the private bucket does not answer, not only the public one", async () => {
    downBucket = PRIVATE_BUCKET

    const response = await loader()

    expect(response.status).toBe(503)
  })

  it("checks the private bucket as well as the public one, not only one of the two", async () => {
    await loader()

    expect(seenBuckets.toSorted()).toEqual([PRIVATE_BUCKET, PUBLIC_BUCKET].toSorted())
  })

  it("reports the database as ok while only storage is down, rather than failing both", async () => {
    downBucket = PUBLIC_BUCKET

    const report = await loader().then((response) => response.json()) as {
      checks: { name: string, ok: boolean }[]
    }

    expect(report.checks.find((check) => check.name === "database")?.ok).toBe(true)
    expect(report.checks.find((check) => check.name === "storage")?.ok).toBe(false)
  })

  it("answers 200 when both the database and the store answer", async () => {
    const response = await loader()

    expect(response.status).toBe(200)
  })
})
