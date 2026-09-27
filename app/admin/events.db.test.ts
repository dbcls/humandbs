import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedDataset, seedResearch } from "~/db/seed"

import { eventListing } from "./events.server"

const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

interface Written {
  at: string
  action: s.EventAction
  actor?: { sub: string, name: string }
  subjectType?: s.EventSubjectType
  subjectId?: string
  detail?: Record<string, unknown>
}

async function write(...rows: Written[]): Promise<void> {
  await db.insert(s.event).values(rows.map((row) => ({
    occurredAt: new Date(row.at),
    actorSub: row.actor?.sub ?? "a",
    actorName: row.actor?.name ?? "Alice",
    action: row.action,
    subjectType: row.subjectType ?? "admin",
    subjectId: row.subjectId ?? "x",
    detail: row.detail ?? {},
  })))
}

function listing(query = "") {
  return eventListing(db, new URLSearchParams(query))
}

describe("操作の記録の一覧", () => {
  it("新しい順に並べる", async () => {
    await write(
      { at: "2026-09-01T00:00:00Z", action: "grant-admin" },
      { at: "2026-09-03T00:00:00Z", action: "revoke-admin" },
      { at: "2026-09-02T00:00:00Z", action: "publish-file", subjectType: "file" },
    )

    expect((await listing()).rows.map((row) => row.action)).toEqual(["revoke-admin", "publish-file", "grant-admin"])
  })

  it("操作の種類で絞り、その項目の件数は自分の条件を外して数える", async () => {
    await write(
      { at: "2026-09-01T00:00:00Z", action: "grant-admin" },
      { at: "2026-09-02T00:00:00Z", action: "grant-admin" },
      { at: "2026-09-03T00:00:00Z", action: "revoke-admin" },
    )

    const view = await listing("action=revoke-admin")

    expect(view.rows.map((row) => row.action)).toEqual(["revoke-admin"])
    expect(view.total).toBe(1)
    expect(view.counts["grant-admin"]).toBe(2)
    expect(view.counts["revoke-admin"]).toBe(1)
    expect(view.counts["publish-version"]).toBe(0)
  })

  it("知らない操作の名前は条件にしない", async () => {
    await write({ at: "2026-09-01T00:00:00Z", action: "grant-admin" })

    const view = await listing("action=drop-table")

    expect(view.actions).toEqual([])
    expect(view.total).toBe(1)
  })

  it("操作者で絞る。選べる操作者の名前は、その人の最新の記録の名前", async () => {
    await write(
      { at: "2026-09-01T00:00:00Z", action: "grant-admin", actor: { sub: "a", name: "Alice (old)" } },
      { at: "2026-09-02T00:00:00Z", action: "grant-admin", actor: { sub: "a", name: "Alice" } },
      { at: "2026-09-03T00:00:00Z", action: "grant-admin", actor: { sub: "b", name: "Bob" } },
    )

    const view = await listing("actor=b")

    expect(view.rows.map((row) => row.actor)).toEqual(["Bob"])
    expect(view.actorOptions).toEqual([
      { sub: "a", name: "Alice", count: 2 },
      { sub: "b", name: "Bob", count: 1 },
    ])
  })

  it("選んだ操作者は、ほかの条件で 0 件になっても選べるまま残る", async () => {
    await write(
      { at: "2026-09-01T00:00:00Z", action: "grant-admin", actor: { sub: "a", name: "Alice" } },
      { at: "2026-09-02T00:00:00Z", action: "revoke-admin", actor: { sub: "b", name: "Bob" } },
    )

    const view = await listing("actor=a&action=revoke-admin")

    expect(view.total).toBe(0)
    expect(view.actorOptions.map((one) => one.sub)).toContain("a")
  })

  it("日付は日本時間の日で、両端を含む", async () => {
    await write(
      // 2026-09-27 23:30 in Japan.
      { at: "2026-09-27T14:30:00Z", action: "grant-admin" },
      // 2026-09-28 00:30 in Japan.
      { at: "2026-09-27T15:30:00Z", action: "revoke-admin" },
    )

    expect((await listing("from=2026-09-28")).rows.map((row) => row.action)).toEqual(["revoke-admin"])
    expect((await listing("to=2026-09-27")).rows.map((row) => row.action)).toEqual(["grant-admin"])
    expect((await listing("from=2026-09-27&to=2026-09-28")).total).toBe(2)
  })

  it("20 件ずつに分け、範囲の外のページは最後のページにする", async () => {
    await write(...Array.from({ length: 25 }, (_, i): Written => ({
      at: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      action: "grant-admin",
      subjectId: `s${String(i)}`,
    })))

    const first = await listing()
    expect(first.rows).toHaveLength(20)
    expect(first.pageCount).toBe(2)
    expect([first.rangeFrom, first.rangeTo]).toEqual([1, 20])

    const past = await listing("page=9")
    expect(past.page).toBe(2)
    expect(past.rows).toHaveLength(5)
    expect(past.rows.at(-1)?.subject.name).toBe("s0")

    expect((await listing("size=all")).rows).toHaveLength(25)
  })

  it("対象は今の ID で呼び、研究が残っていればその研究を開けるようにする", async () => {
    const researchId = await seedResearch(db, "hum0001")
    const datasetId = await seedDataset(db, researchId, "JGAD000001")
    await write(
      { at: "2026-09-01T00:00:00Z", action: "publish-version", subjectType: "research-version", subjectId: crypto.randomUUID(), detail: { researchId, versionNumber: 3 } },
      { at: "2026-09-02T00:00:00Z", action: "publish-dataset", subjectType: "dataset", subjectId: datasetId, detail: { versionNumber: 3 } },
      { at: "2026-09-03T00:00:00Z", action: "edit-file-label", subjectType: "file", subjectId: "a.xlsx", detail: { research: researchId } },
      { at: "2026-09-04T00:00:00Z", action: "grant-admin", subjectType: "admin", subjectId: "sub-1", detail: { displayName: "Carol" } },
    )

    const subjects = (await listing()).rows.map((row) => row.subject)

    expect(subjects).toEqual([
      { kind: "admin", name: "Carol", researchId: null },
      { kind: "file", name: "a.xlsx", researchId },
      { kind: "dataset", name: "JGAD000001", researchId },
      { kind: "research-version", name: "hum0001 v3", researchId },
    ])
  })

  it("お知らせは題名 (日本語が先) で、アラートは本文の先頭で呼ぶ", async () => {
    const [newsRow] = await db.insert(s.news).values({}).returning({ id: s.news.id })
    const [alertRow] = await db.insert(s.alert).values({ content: { body: { ja: "", en: `Maintenance ${"x".repeat(60)}\nsecond line` } } }).returning({ id: s.alert.id })
    if (newsRow === undefined || alertRow === undefined) throw new Error("insert failed")
    await db.insert(s.newsContent).values([
      { newsId: newsRow.id, locale: "en", content: { title: "Released", body: "" } },
      { newsId: newsRow.id, locale: "ja", content: { title: "公開しました", body: "" } },
    ])
    await write(
      { at: "2026-09-01T00:00:00Z", action: "publish-site-content", subjectType: "news", subjectId: newsRow.id },
      { at: "2026-09-02T00:00:00Z", action: "publish-site-content", subjectType: "alert", subjectId: alertRow.id },
    )

    expect((await listing()).rows.map((row) => row.subject.name)).toEqual([
      `Maintenance ${"x".repeat(28)}…`,
      "公開しました",
    ])
  })

  it("消えたお知らせとアラートは、記録に書いた名前で呼び、書いていなければ名前を返さない", async () => {
    await write(
      { at: "2026-09-01T00:00:00Z", action: "unpublish-site-content", subjectType: "news", subjectId: crypto.randomUUID(), detail: { title: "Old news" } },
      { at: "2026-09-02T00:00:00Z", action: "unpublish-site-content", subjectType: "alert", subjectId: crypto.randomUUID(), detail: { deleted: true, text: "メンテナンス" } },
      { at: "2026-09-03T00:00:00Z", action: "publish-site-content", subjectType: "alert", subjectId: crypto.randomUUID() },
    )

    expect((await listing()).rows.map((row) => row.subject.name)).toEqual([null, "メンテナンス", "Old news"])
  })

  it("管理者は今の名前で呼ぶ。外した人は記録に書いた名前で呼ぶ", async () => {
    await db.insert(s.adminUser).values({ keycloakSub: "sub-1", displayName: "Carol Now" })
    await write(
      { at: "2026-09-01T00:00:00Z", action: "grant-admin", subjectType: "admin", subjectId: "sub-1", detail: { displayName: "sub-1" } },
      { at: "2026-09-02T00:00:00Z", action: "revoke-admin", subjectType: "admin", subjectId: "sub-2", detail: { displayName: "Dave" } },
    )

    expect((await listing()).rows.map((row) => row.subject.name)).toEqual(["Dave", "Carol Now"])
  })

  it("削除した研究とデータセットは、記録に書いた名前で呼び、開けるようにはしない", async () => {
    const gone = crypto.randomUUID()
    await write(
      { at: "2026-09-01T00:00:00Z", action: "delete-research", subjectType: "research", subjectId: gone, detail: { humLabels: ["hum0099"] } },
      { at: "2026-09-02T00:00:00Z", action: "delete-dataset", subjectType: "dataset", subjectId: crypto.randomUUID(), detail: { researchId: gone, label: "JGAD000099" } },
    )

    expect((await listing()).rows.map((row) => row.subject)).toEqual([
      { kind: "dataset", name: "JGAD000099", researchId: null },
      { kind: "research", name: "hum0099", researchId: null },
    ])
  })
})
