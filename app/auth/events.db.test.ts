import { eq, sql } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { emptyDatasetContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { BOOTSTRAP_ACTOR, recordEvent } from "./events.server"

/**
 * The audit trail against the development database.
 *
 * The point of these is the privileges: the guarantee that the log is
 * append-only is a property of the role the application connects as, and `db`
 * here is that role. A test that only checked the application never issues an
 * UPDATE would be checking the wrong thing.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function anEvent(): Promise<void> {
  await recordEvent(db, {
    actor: { sub: "0f3a", name: "curator" },
    action: "publish-version",
    subjectType: "research-version",
    subjectId: "hum0001-v2",
    detail: { humLabel: "hum0001" },
  })
}

function one<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error("the insert returned no row")
  return row
}

/**
 * A row in `replaced_dataset_content`, with the research, dataset and event it
 * references. The row itself is reached through the app role, same as
 * everywhere else here — only its prerequisites need real identities.
 */
async function aReplacedContent(): Promise<void> {
  const researchRow = one(await db.insert(s.research).values({}).returning({ id: s.research.id }))
  const datasetRow = one(
    await db.insert(s.dataset).values({ researchId: researchRow.id }).returning({ id: s.dataset.id }),
  )
  const eventRow = one(await db
    .insert(s.event)
    .values({
      actorSub: "0f3a",
      actorName: "curator",
      action: "publish-fix",
      subjectType: "dataset",
      subjectId: datasetRow.id,
    })
    .returning({ id: s.event.id }))
  await db.insert(s.replacedDatasetContent).values({
    datasetId: datasetRow.id,
    content: emptyDatasetContent(),
    eventId: eventRow.id,
  })
}

describe("証跡の書き込み", () => {
  it("誰が・何に・どの操作をしたかを残す", async () => {
    await anEvent()

    const [row] = await db.select().from(s.event)
    expect(row?.actorSub).toBe("0f3a")
    expect(row?.actorName).toBe("curator")
    expect(row?.action).toBe("publish-version")
    expect(row?.subjectType).toBe("research-version")
    expect(row?.subjectId).toBe("hum0001-v2")
    expect(row?.detail).toEqual({ humLabel: "hum0001" })
  })

  it("detail を渡さなくても書ける", async () => {
    await recordEvent(db, {
      actor: BOOTSTRAP_ACTOR,
      action: "grant-admin",
      subjectType: "admin",
      subjectId: "0f3a",
    })

    const [row] = await db.select().from(s.event)
    expect(row?.detail).toEqual({})
  })

  it("人が起こしていない操作の actor は予約された値で、誰かの sub と混ざらない", () => {
    expect(BOOTSTRAP_ACTOR.sub).toBe("bootstrap")
    expect(BOOTSTRAP_ACTOR.name).toBe("bootstrap")
  })
})

/**
 * Drizzle wraps a failed statement, so what Postgres answered is in the cause.
 * Asserting on it is the whole point: the statement has to fail for want of
 * privilege and not for some other reason that would pass just as quietly.
 */
async function expectPermissionDenied(work: () => Promise<unknown>): Promise<void> {
  const thrown = await work().then(() => null, (error: unknown) => error)
  expect(thrown).toBeInstanceOf(Error)
  const cause = (thrown as Error).cause
  expect(cause).toBeInstanceOf(Error)
  expect((cause as Error).message).toMatch(/permission denied/)
}

describe("append-only の担保", () => {
  it("アプリが繋ぐ role は event を書き換えられない", async () => {
    await anEvent()

    await expectPermissionDenied(() =>
      db.update(s.event).set({ actorName: "somebody else" }).where(eq(s.event.actorSub, "0f3a")),
    )
  })

  it("アプリが繋ぐ role は event を消せない", async () => {
    await anEvent()

    await expectPermissionDenied(() => db.delete(s.event).where(eq(s.event.actorSub, "0f3a")))
  })

  it("アプリが繋ぐ role は event を空にできない", async () => {
    await expectPermissionDenied(() => db.execute(sql`TRUNCATE event`))
  })

  it("アプリが繋ぐ role はどのテーブルも空にできない", async () => {
    await expectPermissionDenied(() => db.execute(sql`TRUNCATE research CASCADE`))
  })

  it("それでも書き足すことはできる", async () => {
    await anEvent()
    await anEvent()

    expect(await db.select().from(s.event)).toHaveLength(2)
  })

  it("アプリが繋ぐ role は replaced_dataset_content を書き換えられない", async () => {
    await aReplacedContent()

    await expectPermissionDenied(() =>
      db.update(s.replacedDatasetContent).set({ content: emptyDatasetContent() }),
    )
  })

  it("アプリが繋ぐ role は replaced_dataset_content を消せない", async () => {
    await aReplacedContent()

    await expectPermissionDenied(() => db.delete(s.replacedDatasetContent))
  })

  it("アプリが繋ぐ role は replaced_dataset_content を空にできない", async () => {
    await expectPermissionDenied(() => db.execute(sql`TRUNCATE replaced_dataset_content`))
  })
})
