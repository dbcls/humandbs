import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { findDocument } from "~/public/site.server"

import {
  contentsAction,
  contentsPage,
  documentAction,
  documentPage,
  newsAction,
  newsListAction,
  newsListPage,
  newsPage,
} from "./contents.server"
import { today } from "./dates"
import { adminContentsPath, adminDocumentPath, adminNewsListPath, adminNewsPath } from "./urls"

/**
 * The site-content screens with their guard on, against the development
 * database.
 *
 * What is worth watching here is the address space. A slug lives in two tables
 * at once, a version-less one answers through a pointer that has to keep
 * answering, and the operations that move a body between the two are the only
 * ones that can break either.
 */
const db = getDb()

const CURATOR = { sub: "1a2b-3c4d", name: "curator", idToken: "an-id-token" }
const READER = { sub: "5e6f-7a8b", name: "somebody", idToken: "another-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
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

function cookie(token: string): string {
  return sessionCookie(token).split(";")[0] ?? ""
}

function get(token: string, path: string): Request {
  return new Request(`http://localhost:8080${path}`, { headers: { cookie: cookie(token) } })
}

function post(token: string, path: string, fields: Record<string, string>): Request {
  return new Request(`http://localhost:8080${path}`, {
    method: "POST",
    headers: {
      "cookie": cookie(token),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  })
}

async function thrown(work: () => Promise<unknown>): Promise<Response> {
  const result = await work().then(() => null, (error: unknown) => error)
  if (!(result instanceof Response)) throw new Error("expected a Response to be thrown")
  return result
}

async function makeDocument(slug: string): Promise<string> {
  return only(await db.insert(s.document).values({ slug }).returning({ id: s.document.id })).id
}

async function publishSide(documentId: string, locale: "ja" | "en", body = "本文"): Promise<void> {
  await db.insert(s.documentContent).values({
    documentId,
    locale,
    content: { title: "題", body },
    published: true,
  })
}

async function slugOf(documentId: string): Promise<string> {
  return only(await db
    .select({ slug: s.document.slug })
    .from(s.document)
    .where(eq(s.document.id, documentId))).slug
}

describe("認可", () => {
  it("admin でなければ開けない", async () => {
    const token = await signIn(READER, false)
    expect((await thrown(() => contentsPage(get(token, adminContentsPath())))).status).toBe(403)
  })
})

describe("slug", () => {
  it("route が持つアドレスは取れない", async () => {
    const token = await signIn(CURATOR, true)
    const result = await contentsAction(
      post(token, adminContentsPath(), { intent: "create-document", slug: "news/2026" }),
    )
    expect(result.status).toBe("reserved-slug")
  })

  it("**一意性は 2 つの表にまたがる。** series が持つ slug の document は作れない", async () => {
    const token = await signIn(CURATOR, true)
    const revision = await makeDocument("x/version/1")
    await db.insert(s.documentSeries).values({ slug: "x", currentId: revision })

    const result = await contentsAction(
      post(token, adminContentsPath(), { intent: "create-document", slug: "x" }),
    )
    expect(result.status).toBe("duplicate-slug")
  })

  it("document が持つ slug には切り出せない", async () => {
    const token = await signIn(CURATOR, true)
    const taken = await makeDocument("faq/version/1")
    const id = await makeDocument("faq")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "cut-into-version",
      number: "1",
    }), id)
    expect(result.status).toBe("duplicate-slug")
    expect(await slugOf(taken)).toBe("faq/version/1")
  })

  it("rename も両方の表を見る", async () => {
    const token = await signIn(CURATOR, true)
    const revision = await makeDocument("x/version/1")
    await db.insert(s.documentSeries).values({ slug: "x", currentId: revision })
    const id = await makeDocument("faq")

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "rename", slug: "x" }),
      id,
    )
    expect(result.status).toBe("duplicate-slug")
    expect(await slugOf(id)).toBe("faq")
  })
})

describe("下書きと公開", () => {
  it("**保存は下書きに書き、公開されている本文は動かない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "公開されている本文")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft",
      locale: "ja",
      revision: "1",
      title: "新しい題",
      body: "書きかけ",
    }), id)

    expect(result.status).toBe("ok")
    expect((await findDocument("faq", "ja"))?.html).toContain("公開されている本文")
  })

  it("公開はフォームの中身を本文にし、下書きを消す", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "古い本文")

    await documentAction(post(token, adminDocumentPath(id), {
      intent: "publish",
      locale: "ja",
      revision: "1",
      title: "題",
      body: "新しい本文",
    }), id)

    expect((await findDocument("faq", "ja"))?.html).toContain("新しい本文")
    const row = only(await db.select().from(s.documentContent).where(eq(s.documentContent.documentId, id)))
    expect(row.draftContent).toBeNull()
    expect(row.publishedAt).not.toBeNull()
  })

  it("一度も書かれていない locale は、公開でそのまま行が生まれる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "publish",
      locale: "en",
      revision: "",
      title: "title",
      body: "body",
    }), id)

    expect(result.status).toBe("ok")
    expect(await findDocument("faq", "en")).not.toBeNull()
    expect(await findDocument("faq", "ja")).toBeNull()
  })

  it("非公開に戻すと、本文は残ったまま読めなくなる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja")

    await documentAction(post(token, adminDocumentPath(id), {
      intent: "unpublish",
      locale: "ja",
      revision: "1",
    }), id)

    expect(await findDocument("faq", "ja")).toBeNull()
    expect(only(await db.select().from(s.documentContent)).content.body).toBe("本文")
  })

  it("**revision が合わなければ何も動かない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "そのまま")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft",
      locale: "ja",
      revision: "99",
      title: "題",
      body: "書きかけ",
    }), id)

    expect(result.status).toBe("stale")
    expect(only(await db.select().from(s.documentContent)).draftContent).toBeNull()
  })

  it("行が既にあるのに revision を持たない保存も、同じく弾かれる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft",
      locale: "ja",
      revision: "",
      title: "題",
      body: "書きかけ",
    }), id)
    expect(result.status).toBe("stale")
  })

  it("**生 HTML は保存を止め、何も書かない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft",
      locale: "ja",
      revision: "",
      title: "題",
      body: "段落\n\n<div>だめ</div>",
    }), id)

    expect(result.status).toBe("body")
    expect(await db.select().from(s.documentContent)).toHaveLength(0)
  })

  it("題が無ければ保存しない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft",
      locale: "ja",
      revision: "",
      title: "",
      body: "本文",
    }), id)
    expect(result.status).toBe("missing-title")
  })

  it("公開と非公開が証跡に残る", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")

    await documentAction(post(token, adminDocumentPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "unpublish", locale: "ja", revision: "1",
    }), id)

    const events = await db.select().from(s.event).orderBy(s.event.occurredAt)
    expect(events.map((row) => row.action)).toEqual([
      "grant-admin",
      "publish-site-content",
      "unpublish-site-content",
    ])
    expect(events[1]?.subjectType).toBe("document")
    expect(events[1]?.detail).toMatchObject({ slug: "faq", locale: "ja" })
  })

  it("下書きの保存は証跡に残らない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    const events = await db.select().from(s.event)
    expect(events.map((row) => row.action)).toEqual(["grant-admin"])
  })
})

describe("版", () => {
  it("**切り出しは移動で、コピーではない。** base の slug は答え続ける", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("guidelines/sharing")
    await publishSide(id, "ja", "ガイドラインの本文")

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }),
      id,
    )

    expect(result.status).toBe("ok")
    expect(await slugOf(id)).toBe("guidelines/sharing/version/1")
    expect(await db.select().from(s.documentContent)).toHaveLength(1)
    expect((await findDocument("guidelines/sharing", "ja"))?.html).toContain("ガイドラインの本文")
    expect((await findDocument("guidelines/sharing/version/1", "ja"))?.html)
      .toContain("ガイドラインの本文")
  })

  it("版を 2 度は切り出せない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const again = await documentAction(
      post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }),
      id,
    )
    expect(again.status).toBe("not-a-revision")
  })

  it("**版番号は打った番号がそのまま入る**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "9" }), id)
    const series = only(await db.select().from(s.documentSeries))

    const redirected = await thrown(() => contentsAction(
      post(token, adminContentsPath(), { intent: "add-version", seriesId: series.id, number: "10" }),
    ))
    expect(redirected.status).toBe(302)

    const slugs = (await db.select({ slug: s.document.slug }).from(s.document)).map((r) => r.slug)
    expect(slugs.sort()).toEqual(["x/version/10", "x/version/9"])
  })

  it("既に使われている版番号は弾かれる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "3" }), id)
    const series = only(await db.select().from(s.documentSeries))

    const result = await contentsAction(
      post(token, adminContentsPath(), { intent: "add-version", seriesId: series.id, number: "3" }),
    )
    expect(result.status).toBe("duplicate-slug")
    expect(await db.select().from(s.document)).toHaveLength(1)
  })

  it("整数でない版番号は弾かれる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1.5" }),
      id,
    )
    expect(result.status).toBe("malformed-version")
    expect(await db.select().from(s.documentSeries)).toHaveLength(0)
  })

  it("**指し先になれるのは自分の版だけ**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    const stranger = await makeDocument("faq")

    const result = await contentsAction(post(token, adminContentsPath(), {
      intent: "repoint-series",
      seriesId: series.id,
      documentId: stranger,
    }))
    expect(result.status).toBe("not-a-revision")
  })

  it("張り替えると、版なし slug は新しい指し先の本文を出す", async () => {
    const token = await signIn(CURATOR, true)
    const first = await makeDocument("x")
    await publishSide(first, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(first), { intent: "cut-into-version", number: "1" }), first)
    const series = only(await db.select().from(s.documentSeries))

    const second = await makeDocument("x/version/2")
    await publishSide(second, "ja", "二つ目")
    await contentsAction(post(token, adminContentsPath(), {
      intent: "repoint-series",
      seriesId: series.id,
      documentId: second,
    }))

    expect((await findDocument("x", "ja"))?.html).toContain("二つ目")
  })

  it("**指し先が公開されていない言語では、版なし slug も 404 になる**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    expect(await findDocument("x", "ja")).not.toBeNull()
    expect(await findDocument("x", "en")).toBeNull()

    const view = await contentsPage(get(token, adminContentsPath()))
    expect(view.unanswered).toEqual([{ slug: "x", locales: ["en"] }])
  })

  it("**指し先になっている document は消せない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "delete-document" }),
      id,
    )
    expect(result.status).toBe("in-use")
    expect(await db.select().from(s.document)).toHaveLength(1)
  })

  it("**系列を消すと、版なし slug と配下の版が一緒に消える**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    const second = await makeDocument("x/version/2")
    await publishSide(second, "ja", "二つ目")

    await thrown(() => contentsAction(
      post(token, adminContentsPath(), { intent: "delete-series", seriesId: series.id }),
    ))

    expect(await db.select().from(s.documentSeries)).toHaveLength(0)
    expect(await db.select().from(s.document)).toHaveLength(0)
    expect(await findDocument("x", "ja")).toBeNull()
    expect(await findDocument("x/version/1", "ja")).toBeNull()
    expect(await findDocument("x/version/2", "ja")).toBeNull()
  })

  it("系列を消すと、公開されていた版ごとに証跡が残る", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    await makeDocument("x/version/2")

    await thrown(() => contentsAction(
      post(token, adminContentsPath(), { intent: "delete-series", seriesId: series.id }),
    ))

    const events = await db.select().from(s.event)
    const removals = events.filter((one) => one.action === "unpublish-site-content")
    expect(removals).toHaveLength(1)
    expect(removals[0]?.detail).toMatchObject({ slug: "x/version/1", deleted: true, locales: ["ja"] })
  })
})

describe("お知らせ", () => {
  it("作ると今日の日付で始まり、その画面へ送られる", async () => {
    const token = await signIn(CURATOR, true)
    const redirected = await thrown(() => newsListAction(
      post(token, adminNewsListPath(), { intent: "create-news" }),
    ))

    expect(redirected.status).toBe(302)
    const row = only(await db.select().from(s.news))
    expect(row.publishedAt).toBe(today())
    expect(redirected.headers.get("location")).toContain(row.id)
  })

  it("公開日は admin が入れる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({}).returning({ id: s.news.id })).id

    await newsAction(post(token, adminNewsPath(id), {
      intent: "set-date",
      publishedAt: "2026-03-01",
    }), id)
    expect(only(await db.select().from(s.news)).publishedAt).toBe("2026-03-01")
  })

  it("公開は locale ごとで、証跡の相手は news になる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({}).returning({ id: s.news.id })).id

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    expect(result.status).toBe("ok")
    expect(only(await db.select().from(s.newsContent)).published).toBe(true)
    const [event] = await db.select().from(s.event).where(eq(s.event.subjectType, "news"))
    expect(event?.action).toBe("publish-site-content")
  })

  it("1 件の画面は公開日と 2 つの言語を返す", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-05-05" })
      .returning({ id: s.news.id })).id

    const view = await newsPage(get(token, adminNewsPath(id)), id)
    expect(view?.publishedAt).toBe("2026-05-05")
    expect(view?.editors.map((editor) => editor.locale)).toEqual(["ja", "en"])
  })

  it("一覧は未公開のものも並べる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-01-01" })
      .returning({ id: s.news.id })).id
    await db.insert(s.newsContent).values({
      newsId: id,
      locale: "ja",
      content: { title: "下書き", body: "" },
      published: false,
    })

    const view = await newsListPage(get(token, adminNewsListPath()))
    expect(view.items.map((item) => item.title)).toEqual(["下書き"])
    expect(view.items[0]?.states.ja.published).toBe(false)
  })
})

describe("バナー", () => {
  it("表示の切り替えだけが証跡に残る", async () => {
    const token = await signIn(CURATOR, true)
    await contentsAction(post(token, adminContentsPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    await contentsAction(post(token, adminContentsPath(), {
      intent: "update-alert", alertId: alert.id, ja: "お知らせ", en: "notice", active: "on",
    }))
    await contentsAction(post(token, adminContentsPath(), {
      intent: "update-alert", alertId: alert.id, ja: "直した", en: "fixed", active: "on",
    }))

    const events = await db.select().from(s.event).where(eq(s.event.subjectType, "alert"))
    expect(events.map((row) => row.action)).toEqual(["publish-site-content"])
    expect(only(await db.select().from(s.alert)).content.body.ja).toBe("直した")
  })

  it("バナーの本文も生 HTML を弾く", async () => {
    const token = await signIn(CURATOR, true)
    await contentsAction(post(token, adminContentsPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    const result = await contentsAction(post(token, adminContentsPath(), {
      intent: "update-alert", alertId: alert.id, ja: "<div>だめ</div>", en: "",
    }))
    expect(result.status).toBe("body")
    expect(only(await db.select().from(s.alert)).content.body.ja).toBe("")
  })
})

describe("画面", () => {
  it("document の画面は、自分がどの版かを言う", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const view = await documentPage(get(token, adminDocumentPath(id)), id)
    expect(view?.seriesOf).toMatchObject({ slug: "x", number: 1, isCurrent: true })
  })

  it("uuid でない id は 404 ではなく null で返る", async () => {
    const token = await signIn(CURATOR, true)
    expect(await documentPage(get(token, adminDocumentPath("not-a-uuid")), "not-a-uuid")).toBeNull()
  })

  it("フォームには下書きが入り、公開されている本文も併せて返る", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "公開分")
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "save-draft", locale: "ja", revision: "1", title: "題", body: "下書き",
    }), id)

    const view = await documentPage(get(token, adminDocumentPath(id)), id)
    const ja = view?.editors.find((editor) => editor.locale === "ja")
    expect(ja?.draftBody).toBe("下書き")
    expect(ja?.body).toBe("公開分")
    expect(ja?.hasDraft).toBe(true)
    expect(ja?.revision).toBe(2)
  })
})
