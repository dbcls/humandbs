import { afterAll, beforeEach, describe, expect, it } from "vitest"

/**
 * The notification against the real database, with Slack replaced by a
 * function that keeps what it was given — Slack is outside the portal, and the
 * only thing this suite does not run for real.
 *
 * What is checked is what reaches the channel and what never does: an
 * administrator's comment, what happened before there was anywhere to send
 * it, and what Slack refused, which has to go out with the next message.
 */

import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { emptyResearchContent } from "~/content/empty"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { seedResearch, seedVersion } from "~/db/seed"
import { DRAFT_ANCHOR } from "~/review/anchors"

import { notifySlack, SETTLE_MS, type SendToSlack } from "./notify.server"

const db = getDb()

const ORIGIN = "https://humandbs.example.org"
const ADMIN = "admin-sub"
/** 19:00 in JST, on a boundary of every interval these tests use. */
const START = new Date("2026-09-27T10:00:00Z")
/**
 * Five minutes, which divides a day as an interval has to: the calls below at
 * 5 and 10 minutes are each the first past a boundary.
 */
const INTERVAL = 5
const BOOTSTRAP = { sub: BOOTSTRAP_ACTOR.sub, name: BOOTSTRAP_ACTOR.name }

/** The time a call at `minutes` after the first reads up to. */
function readUpTo(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000 - SETTLE_MS)
}

function at(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000)
}

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
  await db.insert(s.adminUser).values({ keycloakSub: ADMIN, displayName: "管理者" })
})

afterAll(async () => {
  await closePools()
})

function recorder(): { sent: string[], send: SendToSlack } {
  const sent: string[] = []
  return { sent, send: (text) => Promise.resolve(void sent.push(text)) }
}

async function seedDraft(): Promise<{ researchId: string, draftId: string }> {
  const researchId = await seedResearch(db, "hum0034")
  const [draft] = await db.insert(s.researchDraft).values({
    researchId,
    content: emptyResearchContent(),
    shareToken: `share-${researchId}`,
    name: "v7 予定",
  }).returning({ id: s.researchDraft.id })
  if (draft === undefined) throw new Error("no draft")
  return { researchId, draftId: draft.id }
}

async function commentAt(draftId: string, createdAt: Date, author: { sub: string | null, name: string }): Promise<void> {
  await db.insert(s.comment).values({
    draftId,
    anchor: DRAFT_ANCHOR,
    authorSub: author.sub,
    authorName: author.name,
    body: "本文は送らない",
    createdAt,
  })
}

async function readUntil(): Promise<Date | undefined> {
  const [row] = await db.select().from(s.slackNotification)
  return row?.readUntil
}

/** The first call, which only records where reading starts. */
async function begin(send: SendToSlack | null = null): Promise<void> {
  expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(0), origin: ORIGIN, send })).toBe("not-due")
}

describe("notifySlack", () => {
  it("初めて呼んだときは時刻だけを記録し、それより前に起きたことは送らない", async () => {
    const { draftId } = await seedDraft()
    await commentAt(draftId, new Date(START.getTime() - 10 * 60_000), { sub: null, name: "山田" })
    const { sent, send } = recorder()

    await begin(send)
    expect(await readUntil()).toEqual(readUpTo(0))
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("quiet")
    expect(sent).toEqual([])
  })

  it("60 分なら毎時 0 分までに起きたことを、0 分から 1 分たって送る。区切りを過ぎるまでは送らない", async () => {
    const { draftId } = await seedDraft()
    const { sent, send } = recorder()
    const hourly = (now: Date) => notifySlack(db, { intervalMinutes: 60, now, origin: ORIGIN, send })
    expect(await hourly(at(0))).toBe("not-due")
    // 19:00 in JST is the first boundary past the start; nothing had happened by then.
    expect(await hourly(at(1))).toBe("quiet")
    expect(await readUntil()).toEqual(at(0))

    await commentAt(draftId, at(30), { sub: null, name: "山田" })
    expect(await hourly(new Date(at(61).getTime() - 1))).toBe("not-due")
    expect(sent).toEqual([])
    expect(await hourly(at(61))).toBe("sent")
    expect(sent).toHaveLength(1)
    expect(await readUntil()).toEqual(at(60))
  })

  it("共有リンクからのコメントは送り、本文は送らない。admin が書いたコメントと押したボタンは送らない", async () => {
    const { researchId, draftId } = await seedDraft()
    const { sent, send } = recorder()
    await begin(send)
    await commentAt(draftId, readUpTo(1), { sub: null, name: "山田" })
    await commentAt(draftId, readUpTo(2), { sub: "provider-sub", name: "佐藤" })
    await commentAt(draftId, readUpTo(3), { sub: ADMIN, name: "管理者" })
    await db.insert(s.reviewAcknowledgement).values([
      { draftId, kind: "commented", actorSub: null, actorName: "山田", createdAt: readUpTo(4) },
      { draftId, kind: "approved", actorSub: ADMIN, actorName: "管理者", createdAt: readUpTo(4) },
    ])

    // The first call past the 19:05 boundary, which all of them are before.
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(6), origin: ORIGIN, send })).toBe("sent")
    expect(sent).toEqual([[
      "*レビュー*",
      `• <${ORIGIN}/admin/research/${researchId}/draft/${draftId}/review|hum0034 / v7 予定>: `
      + "コメント 2 件 (山田 (anonymous)、佐藤)、「コメントを書き終えました」1 回",
    ].join("\n")])
  })

  it("移行が書いたコメント (書いた人が bootstrap) は送らない", async () => {
    const { draftId } = await seedDraft()
    const { sent, send } = recorder()
    await begin(send)
    await commentAt(draftId, readUpTo(1), BOOTSTRAP)

    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("quiet")
    expect(sent).toEqual([])
  })

  it("書かれてから 1 分たっていない行は読まず、次の回に送る", async () => {
    const { draftId } = await seedDraft()
    const { sent, send } = recorder()
    await begin(send)
    // Written just after the point the call at 5 minutes reads up to.
    await commentAt(draftId, new Date(readUpTo(5).getTime() + 1), { sub: null, name: "遅れて書いた人" })

    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("quiet")
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(10), origin: ORIGIN, send })).toBe("sent")
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain("遅れて書いた人")
  })

  it("Slack が受け付けなかったら読んだところは進まず、次の回に同じものを、その後に起きたことと一緒に送る", async () => {
    const { draftId } = await seedDraft()
    await begin()
    await commentAt(draftId, readUpTo(1), { sub: null, name: "山田" })

    const refuse: SendToSlack = () => Promise.reject(new Error("Slack did not accept the message: 500"))
    await expect(notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send: refuse })).rejects.toThrow("500")
    expect(await readUntil()).toEqual(readUpTo(0))

    await commentAt(draftId, readUpTo(6), { sub: null, name: "佐藤" })
    const { sent, send } = recorder()
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(6), origin: ORIGIN, send })).toBe("sent")
    expect(sent[0]).toContain("コメント 2 件 (山田 (anonymous)、佐藤 (anonymous))")
    expect(await readUntil()).toEqual(readUpTo(6))
  })

  it("webhook が無いあいだに起きたことは、あとで設定しても送らない", async () => {
    const { draftId } = await seedDraft()
    await begin()
    await commentAt(draftId, readUpTo(1), { sub: null, name: "山田" })
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send: null })).toBe("unsent")

    const { sent, send } = recorder()
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(10), origin: ORIGIN, send })).toBe("quiet")
    expect(sent).toEqual([])
  })

  it("公開・更新の公開・サイトコンテンツの公開は公開ページのリンクを付けて送り、取り下げや ID やファイルの操作は送らない", async () => {
    // Deleted since, so named by what their records wrote.
    const NEWS = "01a0e2a0-0000-7000-8000-000000000001"
    const ALERT = "01a0e2a0-0000-7000-8000-000000000002"
    const researchId = await seedResearch(db, "hum0034")
    const versionId = await seedVersion(db, { researchId, number: 3 })
    await begin()
    const occurredAt = readUpTo(1)
    const actor = { actorSub: ADMIN, actorName: "管理者", occurredAt }
    await db.insert(s.event).values([
      { ...actor, action: "publish-version", subjectType: "research-version", subjectId: versionId, detail: { researchId, versionNumber: 3 } },
      { ...actor, action: "publish-dataset", subjectType: "dataset", subjectId: "dataset-1", detail: { researchId } },
      { ...actor, action: "pass-publish-check", subjectType: "research-version", subjectId: versionId, detail: { researchId } },
      { ...actor, action: "withdraw-version", subjectType: "research-version", subjectId: versionId, detail: { researchId, versionNumber: 2 } },
      { ...actor, action: "pin-label", subjectType: "label", subjectId: "hum0035", detail: { kind: "hum", subject: researchId } },
      { ...actor, action: "publish-file", subjectType: "file", subjectId: "hum0034/a.txt", detail: { researchId } },
      { ...actor, action: "publish-site-content", subjectType: "document", subjectId: "doc-1", detail: { slug: "about", locale: "ja" } },
      { ...actor, action: "publish-site-content", subjectType: "document", subjectId: "doc-1", detail: { slug: "about", locale: "en" } },
      { ...actor, action: "publish-site-content", subjectType: "news", subjectId: NEWS, detail: { title: "システム更新", locale: "en" } },
      { ...actor, action: "publish-site-content", subjectType: "alert", subjectId: ALERT, detail: { text: "メンテナンス" } },
    ])

    const { sent, send } = recorder()
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("sent")
    expect(sent).toEqual([[
      "*公開*",
      `• 公開: <${ORIGIN}/research/hum0034/v3|hum0034 v3> (管理者)`,
      `• サイトコンテンツの公開: 記事「about」 <${ORIGIN}/about|ja> / <${ORIGIN}/en/about|en> (管理者)`,
      `• サイトコンテンツの公開: お知らせ「システム更新」 <${ORIGIN}/en/news/${NEWS}|en> (管理者)`,
      `• サイトコンテンツの公開: アラート「<${ORIGIN}/|メンテナンス>」 (管理者)`,
    ].join("\n")])
  })

  it("別のプロセスが行を持っているあいだは何もせず、同じものを 2 度送らない", async () => {
    const { draftId } = await seedDraft()
    await begin()
    await commentAt(draftId, readUpTo(1), { sub: null, name: "山田" })
    const { sent, send } = recorder()

    await getOwnerDb().transaction(async (holder) => {
      await holder.select().from(s.slackNotification).for("update")
      expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("busy")
    })
    expect(sent).toEqual([])
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("sent")
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(10), origin: ORIGIN, send })).toBe("quiet")
    expect(sent).toHaveLength(1)
  })

  it("行が消えた下書きのコメントは、下書きと一緒に消えているので送らない", async () => {
    const { draftId } = await seedDraft()
    await begin()
    await commentAt(draftId, readUpTo(1), { sub: null, name: "山田" })
    await db.delete(s.researchDraft)

    const { sent, send } = recorder()
    expect(await notifySlack(db, { intervalMinutes: INTERVAL, now: at(5), origin: ORIGIN, send })).toBe("quiet")
    expect(sent).toEqual([])
  })
})
