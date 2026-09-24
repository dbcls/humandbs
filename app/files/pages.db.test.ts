import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import {
  commonPrefix,
  MULTIPART_THRESHOLD,
  PRIVATE_BUCKET,
  PUBLIC_BUCKET,
  privatePrefix,
  publicPrefix,
} from "./box"
import { today } from "~/dates"
import { emptyDatasetContent } from "~/content/empty"

import {
  commonFilesAction,
  commonFilesPage,
  commonUploadAction,
  filesAction,
  filesPage,
  fileUploadAction,
} from "./pages.server"
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

function postForm(token: string, fields: [string, string][], search = ""): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
  headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
  return new Request(`http://localhost:8080/admin/research/${researchId}/files${search}`, {
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

/** Where an answer sends the reader, as the path and the settings in its query. */
function sentTo(answer: unknown): [string, [string, string][]] {
  if (!(answer instanceof Response)) throw new Error("expected a redirect")
  const to = new URL(answer.headers.get("Location") ?? "", "http://localhost:8080")
  return [to.pathname, [...to.searchParams]]
}

/** The ordering, page size and page a listing was read at, with something that is not one of them. */
/** The settings this box is read at — what narrows it is one of them — with something that is not one. */
const READ_AT = "?sort=size&order=desc&size=50&page=2&q=unrelated&state=public&other=x"
const KEPT: [string, string][] = [
  ["sort", "size"],
  ["order", "desc"],
  ["size", "50"],
  ["page", "2"],
  ["q", "unrelated"],
  ["state", "public"],
]

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

  describe("the datasets that select a file", () => {
    async function publishedDataset(label: string, fileSelection: string[], of = researchId): Promise<void> {
      await db.insert(s.searchDoc).values({
        targetType: "dataset",
        targetId: crypto.randomUUID(),
        researchId: of,
        humLabel,
        datasetLabel: label,
        content: { ...emptyDatasetContent(), fileSelection },
        title: "",
        textJa: "",
        textEn: "",
      })
    }

    it("names every published dataset that selects each file, in label order", async () => {
      await research()
      const token = await signIn(CURATOR, true)
      await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}b.zip`)
      await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}c.zip`)
      await publishedDataset("NHA000002", ["a.zip", "b.zip"])
      await publishedDataset("NHA000001", ["a.zip"])

      const view = await filesPage(get(token), JA, researchId)

      expect(view.selectedBy).toEqual({ "a.zip": ["NHA000001", "NHA000002"], "b.zip": ["NHA000002"] })
    })

    it("names only the files on the page shown, and none that the box does not hold", async () => {
      await research()
      const token = await signIn(CURATOR, true)
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}b.zip`)
      await publishedDataset("NHA000001", ["a.zip", "b.zip", "gone.zip"])

      const view = await filesPage(get(token, "?q=b"), JA, researchId)

      expect(view.selectedBy).toEqual({ "b.zip": ["NHA000001"] })
    })

    it("does not read another research's datasets", async () => {
      await research()
      const token = await signIn(CURATOR, true)
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
      const other = only(await db.insert(s.research).values({}).returning({ id: s.research.id })).id
      await publishedDataset("NHA000009", ["a.zip"], other)

      const view = await filesPage(get(token), JA, researchId)

      expect(view.selectedBy).toEqual({})
    })
  })

  it("counts the whole box rather than the page it shows", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    for (const name of ["a.zip", "b.zip"]) {
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}${name}`, "1234")
    }

    const view = await filesPage(get(token), JA, researchId)

    expect(view.total).toBe(2)
    expect(view.counts).toEqual({ public: 0, private: 2 })
  })

  it("keeps the files whose name holds every word typed, and the side asked for, counting each side", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}open-a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}open-b.txt`)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}closed-a.zip`)
    const names = async (search: string) =>
      (await filesPage(get(token, search), JA, researchId)).rows?.map((row) => row.name)

    expect(await names("?q=ZIP%20a")).toEqual(["closed-a.zip", "open-a.zip"])
    expect(await names("?state=public")).toEqual(["open-a.zip", "open-b.txt"])
    expect(await names("?state=private")).toEqual(["closed-a.zip"])
    // Both sides is every file; a side that is not one is not a side.
    expect(await names("?state=public&state=private")).toHaveLength(3)
    expect(await names("?state=moved")).toHaveLength(3)

    // The sides are counted with the side condition off and the words on.
    const narrowed = await filesPage(get(token, "?q=zip&state=private"), JA, researchId)
    expect(narrowed.states).toEqual(["private"])
    expect(narrowed.rows?.map((row) => row.name)).toEqual(["closed-a.zip"])
    expect(narrowed.counts).toEqual({ public: 1, private: 1 })
    expect(narrowed.total).toBe(1)
  })

  it("cuts the box at the page size asked for, and at the default for any other", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    for (let at = 0; at < 21; at += 1) {
      await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}${String(at).padStart(2, "0")}.zip`)
    }
    const cut = async (search: string) => {
      const view = await filesPage(get(token, search), JA, researchId)
      return [view.size, view.rows?.length, view.pageCount, view.rangeFrom, view.rangeTo]
    }

    expect(await cut("")).toEqual([20, 20, 2, 1, 20])
    expect(await cut("?page=2")).toEqual([20, 1, 2, 21, 21])
    expect(await cut("?size=50")).toEqual([50, 21, 1, 1, 21])
    // Past the last page of a larger size is that last page, not an empty one.
    expect(await cut("?size=100&page=2")).toEqual([100, 21, 1, 1, 21])
    for (const asked of ["?size=21", "?size=0", "?size=-20", "?size=abc", "?size="]) {
      expect(await cut(asked), asked).toEqual([20, 20, 2, 1, 20])
    }
  })

  it("returns to the listing it was sent from, with its ordering, page size and page", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}b.zip`)
    const listing = `/admin/research/${researchId}/files`

    const deleted = await filesAction(
      postForm(token, [["intent", "delete"], ["name", "a.zip"]], READ_AT),
      JA,
      researchId,
    )
    expect(sentTo(deleted)).toEqual([listing, KEPT])

    const published = await filesAction(
      postForm(token, [["intent", "publish"], ["name", "b.zip"]], READ_AT),
      JA,
      researchId,
    )
    expect(sentTo(published)).toEqual([listing, KEPT])

    // A reader who chose nothing comes back to the bare address.
    const bare = await filesAction(
      postForm(token, [["intent", "unpublish"], ["name", "b.zip"]]),
      JA,
      researchId,
    )
    expect(sentTo(bare)).toEqual([listing, []])
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

  const rename = (token: string, from: string, to: string, search = "") =>
    filesAction(postForm(token, [["intent", "rename"], ["from", from], ["to", to]], search), JA, researchId)

  it("renames a private file on its own side, and writes nothing down", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`, "bytes")

    const answer = await rename(token, "a.zip", "b.zip", READ_AT)

    expect(sentTo(answer)).toEqual([`/admin/research/${researchId}/files`, KEPT])
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([`${privatePrefix(researchId)}b.zip`])
    expect((await db.select().from(s.event)).filter((row) => row.subjectType === "file")).toEqual([])
  })

  it("renames a public file on both sides, and writes the move as an address that starts and one that stops", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}a.zip`)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

    await rename(token, "a.zip", "b.zip")

    expect(await keysUnder(PUBLIC_BUCKET, publicPrefix(humLabel))).toEqual([`${publicPrefix(humLabel)}b.zip`])
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([`${privatePrefix(researchId)}b.zip`])
    const events = (await db.select().from(s.event)).filter((row) => row.subjectType === "file")
    expect(events.map((row) => [row.action, row.subjectId])).toEqual([
      ["publish-file", "b.zip"],
      ["delete-file", "a.zip"],
    ])
  })

  it("refuses a name that is a file already on either side, and moves nothing", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}b.zip`)

    expect(await rename(token, "a.zip", "b.zip")).toEqual({ status: "name-taken" })
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([`${privatePrefix(researchId)}a.zip`])
  })

  it("refuses a name with a separator, since the box is flat", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

    expect(await rename(token, "a.zip", "dir/a.zip")).toEqual({ status: "malformed-name" })
    expect(await rename(token, "a.zip", "")).toEqual({ status: "malformed-name" })
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([`${privatePrefix(researchId)}a.zip`])
  })

  it("leaves a file alone while its switch is still queued", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await db.insert(s.filePublishJob).values({ researchId, fileName: "a.zip", action: "publish" })

    expect(await rename(token, "a.zip", "b.zip")).toEqual({ status: "switching" })
    expect(await keysUnder(PRIVATE_BUCKET, privatePrefix(researchId))).toEqual([`${privatePrefix(researchId)}a.zip`])
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

  it("says which of the names the box already holds, from either side of the store", async () => {
    await research()
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)
    await putTestObject(PUBLIC_BUCKET, `${publicPrefix(humLabel)}b.zip`)

    const answer = await fileUploadAction(
      postJson(token, { kind: "check", names: ["c.zip", "b.zip", "a.zip"] }),
      researchId,
    )

    expect(answer).toEqual({ kind: "check", existing: ["b.zip", "a.zip"] })
  })

  it("holds none of the names while the box is empty", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const answer = await fileUploadAction(
      postJson(token, { kind: "check", names: ["a.zip"] }),
      researchId,
    )

    expect(answer).toEqual({ kind: "check", existing: [] })
  })

  it("looks at the private side alone while no label has been pinned", async () => {
    await research(false)
    const token = await signIn(CURATOR, true)
    await putTestObject(PRIVATE_BUCKET, `${privatePrefix(researchId)}a.zip`)

    const answer = await fileUploadAction(
      postJson(token, { kind: "check", names: ["a.zip", "b.zip"] }),
      researchId,
    )

    expect(answer).toEqual({ kind: "check", existing: ["a.zip"] })
  })

  it("refuses a check that names something outside the box, even among good names", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => fileUploadAction(
      postJson(token, { kind: "check", names: ["a.zip", "../escape.zip"] }),
      researchId,
    ))
    expect(refusal.status).toBe(400)
  })

  it("refuses a check that names nothing", async () => {
    await research()
    const token = await signIn(CURATOR, true)

    const refusal = await thrown(() => fileUploadAction(
      postJson(token, { kind: "check", names: [] }),
      researchId,
    ))
    expect(refusal.status).toBe(400)
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

/**
 * The `common/` box, which every test in this file shares with the development
 * data — it belongs to no research, so there is no identity to scope it by.
 *
 * **Everything here works under a prefix of its own** and clears only that,
 * because clearing the box would take the article assets somebody is looking at
 * in the next tab with it.
 */
describe("the article assets", () => {
  const MINE = "zz-test-"
  const mine = (slug: string): string => `${MINE}${counter}/${slug}`
  const at = (slug: string): string => commonPrefix() + slug

  afterEach(async () => {
    await clearPrefix(PUBLIC_BUCKET, commonPrefix() + MINE)
  })

  function postCommon(token: string, fields: [string, string][], search = ""): Request {
    const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" })
    headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
    return new Request(`http://localhost:8080/admin/files${search}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(fields).toString(),
    })
  }

  async function held(): Promise<string[]> {
    return keysUnder(PUBLIC_BUCKET, commonPrefix() + MINE)
  }

  function getCommon(token: string, search = ""): Request {
    const headers = new Headers()
    headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
    return new Request(`http://localhost:8080/admin/files${search}`, { headers })
  }

  function postCommonJson(token: string, payload: unknown): Request {
    const headers = new Headers({ "content-type": "application/json" })
    headers.set("cookie", sessionCookie(token).split(";")[0] ?? "")
    return new Request("http://localhost:8080/admin/files/upload", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
  }

  /** A name an upload could carry: flat, under this test's own prefix all the same. */
  const flat = (slug: string): string => `${MINE}${counter}-${slug}`

  /** The box is shared with whatever else the store holds, so every question is put under this test's own prefix. */
  const own = (): string => `${MINE}${counter}/`
  const under = (rest = ""): string => `?q=${encodeURIComponent(own())}${rest}`

  /** The settings this box is read at — what narrows it is one of them — with something that is not one. */
  const READ_COMMON_AT = "?sort=size&order=desc&size=50&page=2&q=pdf%20dac&from=2026-09-01&to=2026-09-30&other=x"
  const KEPT_COMMON: [string, string][] = [
    ["sort", "size"],
    ["order", "desc"],
    ["size", "50"],
    ["page", "2"],
    ["q", "pdf dac"],
    ["from", "2026-09-01"],
    ["to", "2026-09-30"],
  ]

  it("says which names are already in the box, and writes nothing to the trail for asking", async () => {
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, at(flat("a.png")))

    const answer = await commonUploadAction(
      postCommonJson(token, { kind: "check", names: [flat("b.png"), flat("a.png")] }),
    )

    expect(answer).toEqual({ kind: "check", existing: [flat("a.png")] })
    const events = (await db.select().from(s.event)).filter((row) => row.subjectType === "file")
    expect(events).toHaveLength(0)
  })

  it("keeps the files whose slug holds every word typed, and counts what is left", async () => {
    const token = await signIn(CURATOR, true)
    for (const slug of ["a.png", "b.pdf", "sub/c.pdf"]) await putTestObject(PUBLIC_BUCKET, at(mine(slug)))

    const view = await commonFilesPage(getCommon(token, `?q=${encodeURIComponent(`${own()} PDF`)}`), JA)

    expect(view.keyword).toBe(`${own()} PDF`)
    expect(view.rows?.map((row) => row.name)).toEqual([mine("b.pdf"), mine("sub/c.pdf")])
    expect(view.total).toBe(2)
  })

  it("keeps the files written between the two days, cut in JST, with either end open", async () => {
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, at(mine("a.png")))
    const day = today()
    const shifted = (by: number): string =>
      new Date(new Date(`${day}T00:00:00.000Z`).getTime() + by * 86_400_000).toISOString().slice(0, 10)
    const names = async (rest: string): Promise<string[] | undefined> =>
      (await commonFilesPage(getCommon(token, under(rest)), JA)).rows?.map((row) => row.name)

    expect(await names(`&from=${day}`)).toEqual([mine("a.png")])
    expect(await names(`&to=${day}`)).toEqual([mine("a.png")])
    expect(await names(`&from=${day}&to=${day}`)).toEqual([mine("a.png")])
    expect(await names(`&from=${shifted(1)}`)).toEqual([])
    expect(await names(`&to=${shifted(-1)}`)).toEqual([])
    expect(await names(`&from=${shifted(1)}&to=${shifted(-1)}`)).toEqual([])
  })

  it("reads a day that is not one as an end left open, and says so", async () => {
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, at(mine("a.png")))

    const view = await commonFilesPage(getCommon(token, under("&from=2026-02-31&to=tomorrow")), JA)

    expect([view.from, view.to]).toEqual([null, null])
    expect(view.rows?.map((row) => row.name)).toEqual([mine("a.png")])
    // The day the windows over the range open from is the server's, in JST.
    expect(view.today).toBe(today())
  })

  it("moves a file to the slug it was given and leaves nothing at the old one", async () => {
    const token = await signIn(CURATOR, true)
    const from = mine("a.png")
    const to = mine("images/a.png")
    await putTestObject(PUBLIC_BUCKET, at(from))

    const answer = await commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", from], ["to", to]]),
      JA,
    )

    expect(answer).toBeInstanceOf(Response)
    expect(await held()).toEqual([at(to)])
  })

  it("writes the move down as the address that starts answering and the one that stops", async () => {
    const token = await signIn(CURATOR, true)
    const from = mine("a.png")
    const to = mine("b.png")
    await putTestObject(PUBLIC_BUCKET, at(from))

    await commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", from], ["to", to]]),
      JA,
    )

    // Signing a curator in grants them the capability, which is written down
    // too; what this is about is the pair the move leaves on the files.
    const events = (await db.select().from(s.event))
      .filter((one) => one.subjectType === "file")
    expect(events.map((one) => [one.action, one.subjectId]).toSorted())
      .toEqual([["delete-file", at(from)], ["publish-file", at(to)]].toSorted())
  })

  it("refuses a slug another file already answers at, rather than overwriting it", async () => {
    const token = await signIn(CURATOR, true)
    const from = mine("a.png")
    const taken = mine("b.png")
    await putTestObject(PUBLIC_BUCKET, at(from), "one")
    await putTestObject(PUBLIC_BUCKET, at(taken), "another")

    const answer = await commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", from], ["to", taken]]),
      JA,
    )

    expect(answer).toEqual({ status: "slug-taken" })
    expect((await held()).toSorted()).toEqual([at(from), at(taken)].toSorted())
  })

  it("refuses a slug that would name something else than it reads as", async () => {
    const token = await signIn(CURATOR, true)
    const from = mine("a.png")
    await putTestObject(PUBLIC_BUCKET, at(from))

    for (const to of ["", "a//b.png", "../escaped.png", "images/./a.png"]) {
      const answer = await commonFilesAction(
        postCommon(token, [["intent", "rename"], ["from", from], ["to", to]]),
        JA,
      )
      expect(answer, to).toEqual({ status: "malformed-slug" })
    }
    expect(await held()).toEqual([at(from)])
  })

  it("takes the file named by the row away, and only that one", async () => {
    const token = await signIn(CURATOR, true)
    const going = mine("a.png")
    const staying = mine("b.png")
    await putTestObject(PUBLIC_BUCKET, at(going))
    await putTestObject(PUBLIC_BUCKET, at(staying))

    const answer = await commonFilesAction(
      postCommon(token, [["intent", "delete"], ["name", going]]),
      JA,
    )

    expect(answer).toBeInstanceOf(Response)
    expect(await held()).toEqual([at(staying)])
  })

  it("returns to the listing it was sent from, with its ordering, page size, page and what narrowed it", async () => {
    const token = await signIn(CURATOR, true)
    await putTestObject(PUBLIC_BUCKET, at(mine("a.png")))
    await putTestObject(PUBLIC_BUCKET, at(mine("b.png")))

    const moved = await commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", mine("a.png")], ["to", mine("c.png")]], READ_COMMON_AT),
      JA,
    )
    expect(sentTo(moved)).toEqual(["/admin/files", KEPT_COMMON])

    // Given the slug it already has, nothing moves, and the reader still comes back to where they were.
    const unmoved = await commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", mine("b.png")], ["to", mine("b.png")]], READ_COMMON_AT),
      JA,
    )
    expect(sentTo(unmoved)).toEqual(["/admin/files", KEPT_COMMON])

    const deleted = await commonFilesAction(
      postCommon(token, [["intent", "delete"], ["name", mine("b.png")]], READ_COMMON_AT),
      JA,
    )
    expect(sentTo(deleted)).toEqual(["/admin/files", KEPT_COMMON])

    const bare = await commonFilesAction(
      postCommon(token, [["intent", "delete"], ["name", mine("c.png")]]),
      JA,
    )
    expect(sentTo(bare)).toEqual(["/admin/files", []])
  })

  it("is refused to somebody signed in without the capability to manage site content", async () => {
    const token = await signIn(READER, false)

    const refusal = await thrown(() => commonFilesAction(
      postCommon(token, [["intent", "rename"], ["from", "a.png"], ["to", "b.png"]]),
      JA,
    ))
    expect(refusal.status).toBe(403)
  })
})
