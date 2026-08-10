import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { MULTIPART_THRESHOLD, PRIVATE_BUCKET, PUBLIC_BUCKET, privatePrefix, publicPrefix } from "./box"
import { filesAction, filesPage, fileUploadAction } from "./pages.server"
import { clearPrefix, keysUnder, putThroughProxy, putTestObject } from "./_store"

/**
 * The box screen with its guard on, and an upload taken all the way to the
 * store.
 *
 * The upload is the part worth going the whole way for. **A presigned URL is
 * the only limit that can be placed on a transfer the application never sees**,
 * so what has to be shown is that the store refuses a body of the wrong size or
 * the wrong type — not that the application meant to ask for that. The request
 * is made to the proxy with the Host the signature was made for, which is what
 * a browser sends.
 */
const db = getDb()

const CURATOR = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }
const READER = { sub: "9c8b-7a6d", name: "somebody", idToken: "another-id-token" }

const JA = "ja" as const

let researchId = ""
let humLabel = ""
let counter = 0

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  counter += 1
})

afterEach(async () => {
  if (researchId !== "") await clearPrefix(PRIVATE_BUCKET, privatePrefix(researchId))
  if (humLabel !== "") await clearPrefix(PUBLIC_BUCKET, publicPrefix(humLabel))
  researchId = ""
  humLabel = ""
})

afterAll(async () => {
  await closePools()
})

function only<T>(rows: T[]): T {
  const [row] = rows
  if (row === undefined) throw new Error("expected exactly one row")
  return row
}

async function signIn(person: typeof CURATOR, admin: boolean): Promise<string> {
  const token = await createSession(db, person)
  if (admin) await grantAdmin(db, BOOTSTRAP_ACTOR, person)
  return token
}

async function research(withLabel = true): Promise<void> {
  researchId = only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
  if (!withLabel) return
  humLabel = `hum${String(8000 + counter).padStart(4, "0")}`
  await db.insert(s.labelPin).values({ kind: "hum", label: humLabel, researchId, isPrimary: true })
}

function get(token: string | null, search = ""): Request {
  const headers = new Headers()
  if (token !== null) headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080/admin/research/${researchId}/files${search}`, { headers })
}

function postForm(token: string, fields: [string, string][]): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080/admin/research/${researchId}/files`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields).toString(),
  })
}

function postJson(token: string, payload: unknown): Request {
  const headers = new Headers({ "content-type": "application/json" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080/admin/research/${researchId}/files/upload`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
}

async function thrown(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) throw new Error("expected a Response to be thrown")
  return result
}

describe("the box screen", () => {
  it("is refused to somebody signed in without the capability to manage files", async () => {
    await research()
    const token = await signIn(READER, false)

    expect((await thrown(() => filesPage(get(token), JA, researchId))).status).toBe(403)
  })

  it("shows both buckets as one list, saying which side each name came from", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}open.zip`)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}closed.zip`)

    const view = await filesPage(get(token), JA, researchId)

    expect(view.rows?.map((row) => [row.name, row.isPublic]))
      .toEqual([["closed.zip", false], ["open.zip", true]])
  })

  it("counts the whole box rather than the page it shows", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    for (const name of ["a.zip", "b.zip"]) {
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}${name}`, "1234")
    }

    const view = await filesPage(get(token), JA, researchId)

    expect(view.total).toBe(2)
    expect(view.totalBytes).toBe(8)
  })

  it("queues the switch rather than performing it, so the screen never waits", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

    const answer = await filesAction(
      postForm(token, [["intent", "publish"], ["name", "a.zip"]]),
      JA,
      researchId,
    )

    expect(answer).toBeInstanceOf(Response)
    expect(only(await db.select().from(s.filePublishJob)).action).toBe("publish")
  })

  it("refuses to make a file public while the research has no box to put it in", async () => {
    await research(false)
    const token = await signIn(CURATOR, true)

    const answer = await filesAction(
      postForm(token, [["intent", "publish"], ["name", "a.zip"]]),
      JA,
      researchId,
    )

    expect(answer).toEqual({ status: "no-box" })
    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)
  })

  it("says nothing was selected rather than acting on the whole box", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    expect(await filesAction(postForm(token, [["intent", "publish"]]), JA, researchId))
      .toEqual({ status: "nothing-selected" })
  })

  it("deletes the file from both buckets and forgets where it was meant to be", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await db.insert(s.filePublishJob).values({ researchId, fileName: "a.zip", action: "publish" })

    await filesAction(postForm(token, [["intent", "delete"], ["name", "a.zip"]]), JA, researchId)

    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(humLabel))).toEqual([])
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([])
    expect(await db.select().from(s.filePublishJob)).toHaveLength(0)
  })

  it("records a deletion in the trail", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

    await filesAction(postForm(token, [["intent", "delete"], ["name", "a.zip"]]), JA, researchId)

    const events = (await db.select().from(s.event))
      .filter((row) => row.subjectType === "file")
    expect(events.map((row) => row.action)).toEqual(["delete-file"])
    expect(only(events).subjectId).toBe("a.zip")
  })
})

describe("an upload", () => {
  it("is refused to somebody signed in without the capability to manage files", async () => {
    await research()
    const token = await signIn(READER, false)

    const refusal = await thrown(() => fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 1, contentType: "application/zip" }),
      researchId,
    ))
    expect(refusal.status).toBe(403)
  })

  it("signs the size and the type, and asks for no checksum of its own", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )

    if (answer.kind !== "single") throw new Error("expected a single upload")
    const url = new URL(answer.url)
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";").toSorted())
      .toEqual(["content-length", "content-type", "host"])
    // The SDK writes the checksum of an empty body in by default, and the store
    // then rejects every upload against the URL as a bad digest.
    expect([...url.searchParams.keys()].filter((key) => key.startsWith("x-amz-checksum")))
      .toEqual([])
  })

  it("lands the file in the private bucket, reachable through the proxy and nowhere else", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )
    if (answer.kind !== "single") throw new Error("expected a single upload")
    const status = await putThroughProxy(answer.url, "1234", { "Content-Type": "application/zip" })

    expect(status).toBe(200)
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId)))
      .toEqual([`${privatePrefix(researchId)}a.zip`])
    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(humLabel))).toEqual([])
  })

  it("is refused by the store when the body is a different size than was signed", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )
    if (answer.kind !== "single") throw new Error("expected a single upload")
    const status = await putThroughProxy(answer.url, "12345", { "Content-Type": "application/zip" })

    expect(status).toBe(403)
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([])
  })

  it("is refused by the store when the type is not the one that was signed", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )
    if (answer.kind !== "single") throw new Error("expected a single upload")
    const status = await putThroughProxy(answer.url, "1234", { "Content-Type": "text/html" })

    expect(status).toBe(403)
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([])
  })

  it("is refused by the store when no type is sent at all", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )
    if (answer.kind !== "single") throw new Error("expected a single upload")

    expect(await putThroughProxy(answer.url, "1234")).toBe(403)
  })

  it("refuses a name that would put the object outside the box", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => fileUploadAction(
      postJson(token, {
        kind: "single",
        name: "../escape.zip",
        size: 1,
        contentType: "application/zip",
      }),
      researchId,
    ))
    expect(refusal.status).toBe(400)
  })

  it("refuses to sign one PUT for something over the threshold", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => fileUploadAction(
      postJson(token, {
        kind: "single",
        name: "big.zip",
        size: MULTIPART_THRESHOLD + 1,
        contentType: "application/zip",
      }),
      researchId,
    ))
    expect(refusal.status).toBe(400)
  })

  it("signs one URL per part, and the beginning stays on the server", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, {
        kind: "begin",
        name: "big.zip",
        size: MULTIPART_THRESHOLD * 3,
        contentType: "application/zip",
        partCount: 3,
      }),
      researchId,
    )

    if (answer.kind !== "begin") throw new Error("expected a multipart upload")
    expect(answer.urls).toHaveLength(3)
    expect(answer.uploadId).not.toBe("")
    for (const url of answer.urls) {
      expect(new URL(url).searchParams.get("partNumber")).not.toBeNull()
    }

    await fileUploadAction(
      postJson(token, { kind: "abort", name: "big.zip", uploadId: answer.uploadId }),
      researchId,
    )
  })

  it("overwrites when the same name is sent again, because the name is the key", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    const send = async (body: string) => {
      const answer = await fileUploadAction(
        postJson(token, {
          kind: "single",
          name: "a.zip",
          size: body.length,
          contentType: "application/zip",
        }),
        researchId,
      )
      if (answer.kind !== "single") throw new Error("expected a single upload")
      return putThroughProxy(answer.url, body, { "Content-Type": "application/zip" })
    }

    await send("1234")
    await send("123456")

    const view = await filesPage(get(token), JA, researchId)
    expect(view.rows?.map((row) => [row.name, row.size])).toEqual([["a.zip", 6]])
  })

  it("writes nothing to the trail: an upload does not change what is published", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "single", name: "a.zip", size: 4, contentType: "application/zip" }),
      researchId,
    )
    if (answer.kind !== "single") throw new Error("expected a single upload")
    await putThroughProxy(answer.url, "1234", { "Content-Type": "application/zip" })

    const events = (await db.select().from(s.event))
      .filter((row) => row.subjectType === "file")
    expect(events).toHaveLength(0)
  })
})
