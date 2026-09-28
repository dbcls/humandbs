import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { closePools, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import { PRIVATE_BUCKET, PUBLIC_BUCKET } from "~/files/prefix"

/**
 * `/healthz` against the real database, with only the S3 client faked. The
 * database probe is left real: what is under test here is the storage side
 * and the wiring between the two.
 */

let downBucket: string | null = null

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  class FakeS3Client {
    send(command: unknown): Promise<unknown> {
      if (command instanceof actual.HeadBucketCommand) {
        const bucket = command.input.Bucket ?? ""
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
  downBucket = null
})

afterAll(async () => {
  await closePools()
})

describe("the healthz loader", () => {
  it("responds with 503 when the public bucket does not respond", async () => {
    downBucket = PUBLIC_BUCKET

    const response = await loader()

    expect(response.status).toBe(503)
  })

  it("responds with 503 when the private bucket does not respond, not only the public one", async () => {
    downBucket = PRIVATE_BUCKET

    const response = await loader()

    expect(response.status).toBe(503)
  })

  it("reports the database as ok while only storage is down, rather than failing both", async () => {
    downBucket = PUBLIC_BUCKET

    const report = await loader().then((response) => response.json()) as {
      checks: { name: string, ok: boolean }[]
    }

    expect(report.checks.find((check) => check.name === "database")?.ok).toBe(true)
    expect(report.checks.find((check) => check.name === "storage")?.ok).toBe(false)
  })

  it("tells which commit is being served, and null where the image was given none", async () => {
    vi.stubEnv("HUMANDBS_VERSION", "2a6a2b76")
    try {
      expect(await loader().then((response) => response.json())).toMatchObject({ version: "2a6a2b76" })
    } finally {
      vi.unstubAllEnvs()
    }
    vi.stubEnv("HUMANDBS_VERSION", "")
    try {
      expect(await loader().then((response) => response.json())).toMatchObject({ version: null })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("responds with 200 when both the database and the store respond", async () => {
    const response = await loader()

    expect(response.status).toBe(200)
  })
})
