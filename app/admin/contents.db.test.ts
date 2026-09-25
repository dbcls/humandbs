import { eq } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"
import { renderMarkdown } from "~/public/markdown.server"
import { findDocument } from "~/public/site.server"

import {
  alertAction,
  alertsPage,
  articlePreviewAction,
  contentsAction,
  contentsPage,
  documentAction,
  documentPage,
  newsAction,
  newsListAction,
  newsListPage,
  newsPage,
  seriesAction,
  seriesPage,
} from "./contents.server"
import { today } from "~/dates"
import {
  adminAlertPath,
  adminDocumentsPath,
  adminDocumentPath,
  adminNewsListPath,
  adminNewsPath,
  adminSeriesPath,
} from "./urls"

/**
 * The site-content screens with their guard on, against the development
 * database.
 *
 * What is worth watching here is the address space. A slug is kept in two tables
 * at once, a version-less one responds through a pointer that has to keep
 * responding, and the operations that move a body between the two are the only
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
    expect((await thrown(() => contentsPage(get(token, adminDocumentsPath())))).status).toBe(403)
  })
})

describe("slug", () => {
  it("route で使われているアドレスは取れない", async () => {
    const token = await signIn(CURATOR, true)
    const result = await contentsAction(
      post(token, adminDocumentsPath(), { intent: "create-document", slug: "news/2026" }),
    )
    expect(result.status).toBe("reserved-slug")
  })

  it("**一意性は 2 つの表にまたがる。** series が持つ slug の document は作れない", async () => {
    const token = await signIn(CURATOR, true)
    const revision = await makeDocument("x/version/1")
    await db.insert(s.documentSeries).values({ slug: "x", currentId: revision })

    const result = await contentsAction(
      post(token, adminDocumentsPath(), { intent: "create-document", slug: "x" }),
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

  it("バージョンの slug は入力し直せない — 系列の下にある document の rename は拒否する", async () => {
    const token = await signIn(CURATOR, true)
    const revision = await makeDocument("x/version/1")
    await db.insert(s.documentSeries).values({ slug: "x", currentId: revision })

    const result = await documentAction(
      post(token, adminDocumentPath(revision), { intent: "rename", slug: "y" }),
      revision,
    )
    expect(result.status).toBe("not-a-revision")
    expect(await slugOf(revision)).toBe("x/version/1")
  })
})

describe("本文と公開", () => {
  it("**保存は本文そのものを書き換え、公開中ならその場で読者に反映される**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "公開されている本文")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save",
      locale: "ja",
      revision: "1",
      title: "新しい題",
      body: "書き換えた本文",
    }), id)

    expect(result.status).toBe("ok")
    const page = await findDocument("faq", "ja")
    expect(page?.title).toBe("新しい題")
    expect(page?.html).toContain("書き換えた本文")
    expect(page?.html).not.toContain("公開されている本文")
  })

  it("公開はフォームの中身を本文にして、公開にする", async () => {
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
    expect(row.published).toBe(true)
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
      intent: "save",
      locale: "ja",
      revision: "99",
      title: "題",
      body: "書きかけ",
    }), id)

    expect(result.status).toBe("stale")
    expect(only(await db.select().from(s.documentContent)).content.body).toBe("そのまま")
  })

  it("行が既にあるのに revision の無い保存も、同じくエラーになる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja")

    const result = await documentAction(post(token, adminDocumentPath(id), {
      intent: "save",
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
      intent: "save",
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
      intent: "save",
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

  it("保存は証跡に残らない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "save", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    const events = await db.select().from(s.event)
    expect(events.map((row) => row.action)).toEqual(["grant-admin"])
  })
})

describe("バージョン", () => {
  it("**切り出しは移動で、コピーではない。** base の slug は使えたままになる", async () => {
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

  it("バージョンを 2 度は切り出せない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const again = await documentAction(
      post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }),
      id,
    )
    expect(again.status).toBe("not-a-revision")
  })

  it("**バージョン番号は入力した番号がそのまま入る**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "9" }), id)
    const series = only(await db.select().from(s.documentSeries))

    const redirected = await thrown(() => seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "add-version", number: "10" }),
      series.id,
    ))
    expect(redirected.status).toBe(302)

    const slugs = (await db.select({ slug: s.document.slug }).from(s.document)).map((r) => r.slug)
    expect(slugs.sort()).toEqual(["x/version/10", "x/version/9"])
  })

  it("既に使われているバージョン番号はエラーになる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "3" }), id)
    const series = only(await db.select().from(s.documentSeries))

    const result = await seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "add-version", number: "3" }),
      series.id,
    )
    expect(result.status).toBe("duplicate-slug")
    expect(await db.select().from(s.document)).toHaveLength(1)
  })

  it("整数でないバージョン番号はエラーになる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1.5" }),
      id,
    )
    expect(result.status).toBe("malformed-version")
    expect(await db.select().from(s.documentSeries)).toHaveLength(0)
  })

  it("**指し先になれるのは自分のバージョンだけ**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    const stranger = await makeDocument("faq")

    const result = await seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "repoint-series", documentId: stranger }),
      series.id,
    )
    expect(result.status).toBe("not-a-revision")
  })

  it("張り替えると、バージョンなし slug は新しい指し先の本文を出す", async () => {
    const token = await signIn(CURATOR, true)
    const first = await makeDocument("x")
    await publishSide(first, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(first), { intent: "cut-into-version", number: "1" }), first)
    const series = only(await db.select().from(s.documentSeries))

    const second = await makeDocument("x/version/2")
    await publishSide(second, "ja", "二つ目")
    await seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "repoint-series", documentId: second }),
      series.id,
    )

    expect((await findDocument("x", "ja"))?.html).toContain("二つ目")
  })

  it("**指し先が公開されていない言語では、バージョンなし slug も 404 になる**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    expect(await findDocument("x", "ja")).not.toBeNull()
    expect(await findDocument("x", "en")).toBeNull()

    const view = await contentsPage(get(token, adminDocumentsPath()))
    expect(view.unanswered).toEqual([{ slug: "x", locales: ["en"] }])
  })

  it("**指し先になっている document は消せない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const result = await documentAction(
      post(token, adminDocumentPath(id), { intent: "delete-document" }),
      id,
    )
    expect(result.status).toBe("in-use")
    expect(await db.select().from(s.document)).toHaveLength(1)
    expect(await db.select().from(s.documentContent)).toHaveLength(1)
    expect(await db.select().from(s.documentSeries)).toHaveLength(1)
  })

  it("**記事を消すと本文ごと消えて、一覧へ送られる**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja")
    await publishSide(id, "en")

    const redirected = await thrown(() => documentAction(
      post(token, adminDocumentPath(id), { intent: "delete-document" }),
      id,
    ))
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get("location")).toContain(adminDocumentsPath())
    expect(await db.select().from(s.document)).toHaveLength(0)
    expect(await db.select().from(s.documentContent)).toHaveLength(0)

    // 公開されていた言語は、記事 1 件につき 1 つの証跡にまとめて残る。
    const removals = (await db.select().from(s.event))
      .filter((one) => one.action === "unpublish-site-content")
    expect(removals).toHaveLength(1)
    expect(removals[0]?.subjectId).toBe(id)
    expect(removals[0]?.detail).toMatchObject({ slug: "x", deleted: true, locales: ["ja", "en"] })
  })

  it("**バージョンを消すと、その系列の画面へ送られる** — 一覧にはバージョンの行が無い", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    // A second revision, so that the one taken out is not the one the address responds with.
    await thrown(() => seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "add-version", number: "2" }),
      series.id,
    ))
    const second = only((await db.select().from(s.document)).filter((one) => one.slug === "x/version/2"))

    const redirected = await thrown(() => documentAction(
      post(token, adminDocumentPath(second.id), { intent: "delete-document" }),
      second.id,
    ))
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get("location")).toContain(adminSeriesPath(series.id))
    expect(redirected.headers.get("location")).not.toContain(adminDocumentsPath() + "?")
    expect((await db.select().from(s.document)).map((one) => one.slug)).toEqual(["x/version/1"])
  })

  it("**本文を 1 つも持たない記事も消せて、証跡は残らない**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")

    const redirected = await thrown(() => documentAction(
      post(token, adminDocumentPath(id), { intent: "delete-document" }),
      id,
    ))
    expect(redirected.status).toBe(302)
    expect(await db.select().from(s.document)).toHaveLength(0)
    expect(await db.select().from(s.event).where(eq(s.event.subjectType, "document"))).toEqual([])
  })

  it("公開されていない言語だけの記事を消しても、証跡は残らない", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "save", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)
    expect(await db.select().from(s.documentContent)).toHaveLength(1)

    await thrown(() => documentAction(
      post(token, adminDocumentPath(id), { intent: "delete-document" }),
      id,
    ))
    expect(await db.select().from(s.document)).toHaveLength(0)
    expect(await db.select().from(s.documentContent)).toHaveLength(0)
    expect(await db.select().from(s.event).where(eq(s.event.subjectType, "document"))).toEqual([])
  })

  it("**系列を消すと、バージョンなし slug と配下のバージョンが一緒に消える**", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    const second = await makeDocument("x/version/2")
    await publishSide(second, "ja", "二つ目")

    await thrown(() => seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "delete-series" }),
      series.id,
    ))

    expect(await db.select().from(s.documentSeries)).toHaveLength(0)
    expect(await db.select().from(s.document)).toHaveLength(0)
    expect(await findDocument("x", "ja")).toBeNull()
    expect(await findDocument("x/version/1", "ja")).toBeNull()
    expect(await findDocument("x/version/2", "ja")).toBeNull()
  })

  it("系列を消すと、公開されていたバージョンごとに証跡が残る", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await publishSide(id, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    await makeDocument("x/version/2")

    await thrown(() => seriesAction(
      post(token, adminSeriesPath(series.id), { intent: "delete-series" }),
      series.id,
    ))

    const events = await db.select().from(s.event)
    const removals = events.filter((one) => one.action === "unpublish-site-content")
    expect(removals).toHaveLength(1)
    expect(removals[0]?.detail).toMatchObject({ slug: "x/version/1", deleted: true, locales: ["ja"] })
  })
})

describe("お知らせ", () => {
  it("作ると日時は未入力で、その画面へ送られる", async () => {
    const token = await signIn(CURATOR, true)
    const redirected = await thrown(() => newsListAction(
      post(token, adminNewsListPath(), { intent: "create-news" }),
    ))

    expect(redirected.status).toBe(302)
    const row = only(await db.select().from(s.news))
    // 作った時点の日時が入ると、意図して入れた日付と見分けが付かない。
    expect(row.publishedAt).toBeNull()
    expect(redirected.headers.get("location")).toContain(row.id)
  })

  it("日時が未入力のあいだは公開できず、言語はどれも上がらない", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({}).returning({ id: s.news.id })).id

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    expect(result.status).toBe("undated")
    expect(await db.select().from(s.newsContent)).toEqual([])
    expect(await db.select().from(s.event).where(eq(s.event.subjectType, "news"))).toEqual([])
  })

  it("公開中の言語があるあいだは日時を空にできない", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-03-01 09:30:00" })
      .returning({ id: s.news.id })).id
    await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "set-date", publishedAt: "",
    }), id)

    expect(result.status).toBe("dated-while-published")
    expect(only(await db.select().from(s.news)).publishedAt).toBe("2026-03-01 09:30:00")
  })

  it("公開日時は admin が入れる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({}).returning({ id: s.news.id })).id

    await newsAction(post(token, adminNewsPath(id), {
      intent: "set-date",
      publishedAt: "2026-03-01T09:30",
    }), id)
    expect(only(await db.select().from(s.news)).publishedAt).toBe("2026-03-01 09:30:00")
  })

  it("空にすると日時が外れ、書きかけに戻る", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-03-01 09:30:00" })
      .returning({ id: s.news.id })).id

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "set-date", publishedAt: "",
    }), id)

    expect(result.status).toBe("ok")
    expect(only(await db.select().from(s.news)).publishedAt).toBeNull()
  })

  it("暦に無い日は入らず、前の値が残る", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-03-01 09:30:00" })
      .returning({ id: s.news.id })).id

    // 2026 年はうるう年ではない。欄が送るのと同じ形なので、日付として読めるかまで
    // 見ていないと、翌月に繰り上がった値がエラーにならずに入る。
    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "set-date", publishedAt: "2026-02-29T09:30",
    }), id)

    expect(result.status).toBe("unknown-target")
    expect(only(await db.select().from(s.news)).publishedAt).toBe("2026-03-01 09:30:00")
  })

  it("一覧は、日時がまだ来ていない行だけを予約として扱う", async () => {
    const token = await signIn(CURATOR, true)
    await db.insert(s.news).values([
      { publishedAt: "2020-01-01 09:00:00" },
      { publishedAt: "2099-01-01 09:00:00" },
      { publishedAt: null },
    ])

    const view = await newsListPage(get(token, adminNewsListPath()))
    const marked = new Map(view.rows.map((row) => [row.publishedAt, row.scheduled]))
    expect(marked.get("2099-01-01 09:00:00")).toBe(true)
    expect(marked.get("2020-01-01 09:00:00")).toBe(false)
    // 日時を持たない行は書きかけで、待っている先が無い。
    expect(marked.get(null)).toBe(false)
  })

  it("公開は locale ごとで、証跡の相手は news になる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-01-01 09:00:00" })
      .returning({ id: s.news.id })).id

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    expect(result.status).toBe("ok")
    expect(only(await db.select().from(s.newsContent)).published).toBe(true)
    const [event] = await db.select().from(s.event).where(eq(s.event.subjectType, "news"))
    expect(event?.action).toBe("publish-site-content")
  })

  it("**本文を 1 つも持たないお知らせも消せて、一覧へ送られる**", async () => {
    const token = await signIn(CURATOR, true)
    await thrown(() => newsListAction(post(token, adminNewsListPath(), { intent: "create-news" })))
    const id = only(await db.select().from(s.news)).id

    const redirected = await thrown(() => newsAction(
      post(token, adminNewsPath(id), { intent: "delete-news" }),
      id,
    ))
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get("location")).toContain(adminNewsListPath())
    expect(await db.select().from(s.news)).toEqual([])
    expect(await db.select().from(s.event).where(eq(s.event.subjectType, "news"))).toEqual([])
  })

  it("お知らせを消すと本文ごと消えて、公開されていた言語だけが証跡に残る", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-01-01 09:00:00" })
      .returning({ id: s.news.id })).id
    await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)
    await newsAction(post(token, adminNewsPath(id), {
      intent: "save", locale: "en", revision: "", title: "title", body: "body",
    }), id)

    await thrown(() => newsAction(post(token, adminNewsPath(id), { intent: "delete-news" }), id))
    expect(await db.select().from(s.news)).toEqual([])
    expect(await db.select().from(s.newsContent)).toEqual([])

    const removals = (await db.select().from(s.event))
      .filter((one) => one.action === "unpublish-site-content")
    expect(removals).toHaveLength(1)
    expect(removals[0]?.subjectType).toBe("news")
    expect(removals[0]?.subjectId).toBe(id)
    expect(removals[0]?.detail).toEqual({ deleted: true, locales: ["ja"] })
  })

  it("1 件の画面は公開日時と 2 つの言語を返す", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2026-05-05 09:00:00" })
      .returning({ id: s.news.id })).id

    const view = await newsPage(get(token, adminNewsPath(id)), id)
    expect(view?.publishedAt).toBe("2026-05-05 09:00:00")
    expect(view?.scheduled).toBe(false)
    expect(view?.editors.map((editor) => editor.locale)).toEqual(["ja", "en"])
  })

  it("1 件の画面も、日時がまだ来ていなければ予約として返す", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2099-01-01 09:00:00" })
      .returning({ id: s.news.id })).id

    expect((await newsPage(get(token, adminNewsPath(id)), id))?.scheduled).toBe(true)
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
    expect(view.rows.map((row) => row.title)).toEqual(["下書き"])
    expect(view.rows[0]?.states.ja.published).toBe(false)
  })

  it("アドレスの条件で絞られ、絞り込みの項目の件数はその項目の条件だけ外して数える", async () => {
    const token = await signIn(CURATOR, true)
    const dated = async (publishedAt: string | null, published: boolean | null) => {
      const id = only(await db.insert(s.news).values({ publishedAt })
        .returning({ id: s.news.id })).id
      if (published !== null) {
        await db.insert(s.newsContent).values({
          newsId: id,
          locale: "ja",
          content: { title: publishedAt ?? "日付なし", body: "" },
          published,
        })
      }
      return id
    }
    const out = await dated("2026-01-01", true)
    await dated("2026-02-02", false)
    await dated(null, null)

    const view = await newsListPage(get(token, `${adminNewsListPath()}?ja=published`))
    expect(view.rows.map((row) => row.id)).toEqual([out])
    expect(view.total).toBe(1)
    // 日本語の項目は自分の条件を外して数えるので、母集団は 3 件のまま。
    expect(view.counts.ja).toEqual({ published: 1, scheduled: 0, unpublished: 2 })
    // 公開日の項目は日本語の条件を適用した 1 件の中で数える。
    expect(view.counts.dating).toEqual({ dated: 1, undated: 0 })
  })

  it("キーワードは公開日にも一致する", async () => {
    const token = await signIn(CURATOR, true)
    await db.insert(s.news).values([
      { publishedAt: "2026-01-01 09:00:00" },
      { publishedAt: "2026-02-02 09:00:00" },
    ])

    const view = await newsListPage(get(token, `${adminNewsListPath()}?q=2026-02`))
    expect(view.rows.map((row) => row.publishedAt)).toEqual(["2026-02-02 09:00:00"])
  })
})

describe("アラート", () => {
  it("表示の切り替えだけが証跡に残り、本文の保存では表示が動かない", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    await alertAction(post(token, adminAlertPath(), {
      intent: "show-alert", alertId: alert.id, ja: "お知らせ", en: "notice",
    }))
    await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: alert.id, ja: "直した", en: "fixed",
    }))

    const events = await db.select().from(s.event).where(eq(s.event.subjectType, "alert"))
    expect(events.map((row) => row.action)).toEqual(["publish-site-content"])
    const after = only(await db.select().from(s.alert))
    expect(after.content.body.ja).toBe("直した")
    expect(after.active).toBe(true)
  })

  it("表示日は最後に表示にした日で、表示中のあいだだけ持ち、本文の保存では動かない", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))
    const shownAt = async (): Promise<string | null> =>
      only((await alertsPage(get(token, adminAlertPath()))).alerts).shownAt

    // 作ったばかりで、まだ一度も表示にしていない
    expect(await shownAt()).toBeNull()

    // 以前に表示にした跡があっても、いま表示中でなければ持たない
    await db.insert(s.event).values({
      occurredAt: new Date("2020-01-01T00:00:00Z"),
      actorSub: CURATOR.sub,
      actorName: CURATOR.name,
      action: "publish-site-content",
      subjectType: "alert",
      subjectId: alert.id,
    })
    expect(await shownAt()).toBeNull()

    // 表示にした日 — 以前の跡ではなく、最後に表示にした日
    await alertAction(post(token, adminAlertPath(), {
      intent: "show-alert", alertId: alert.id, ja: "お知らせ", en: "notice",
    }))
    expect(await shownAt()).toBe(today())

    await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: alert.id, ja: "直した", en: "fixed",
    }))
    expect(await shownAt()).toBe(today())

    await alertAction(post(token, adminAlertPath(), {
      intent: "hide-alert", alertId: alert.id, ja: "直した", en: "fixed",
    }))
    expect(await shownAt()).toBeNull()
  })

  it("非表示にしたアラートは、本文を保存しても非表示のまま", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    await alertAction(post(token, adminAlertPath(), {
      intent: "show-alert", alertId: alert.id, ja: "お知らせ", en: "notice",
    }))
    await alertAction(post(token, adminAlertPath(), {
      intent: "hide-alert", alertId: alert.id, ja: "お知らせ", en: "notice",
    }))
    await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: alert.id, ja: "直した", en: "fixed",
    }))

    const events = await db.select().from(s.event).where(eq(s.event.subjectType, "alert"))
    expect(events.map((row) => row.action))
      .toEqual(["publish-site-content", "unpublish-site-content"])
    expect(only(await db.select().from(s.alert)).active).toBe(false)
  })

  it("片方の言語しか無いアラートは表示できない", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    const result = await alertAction(post(token, adminAlertPath(), {
      intent: "show-alert", alertId: alert.id, ja: "お知らせ", en: "",
    }))
    expect(result.status).toBe("missing-translation")
    expect(only(await db.select().from(s.alert)).active).toBe(false)
  })

  it("表示しないうちは、片方ずつ書いていける", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    const result = await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: alert.id, ja: "お知らせ", en: "",
    }))
    expect(result.status).toBe("ok")
    expect(only(await db.select().from(s.alert)).content.body.ja).toBe("お知らせ")
  })

  it("アラートの本文も生 HTML を拒否する", async () => {
    const token = await signIn(CURATOR, true)
    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))

    const result = await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: alert.id, ja: "<div>だめ</div>", en: "",
    }))
    expect(result.status).toBe("body")
    expect(only(await db.select().from(s.alert)).content.body.ja).toBe("")
  })

  /**
   * 1 つの文で入れた行は createdAt が同値になる。時刻だけで並べると、行を書き換えた
   * ときに物理順が動いて並びが入れ替わる。
   */
  it("同じ時刻に作ったアラートも、作った順に並ぶ", async () => {
    const token = await signIn(CURATOR, true)
    const createdAt = new Date("2026-01-01T00:00:00Z")
    const made = await db
      .insert(s.alert)
      .values([
        { content: { body: { ja: "1", en: "one" } }, createdAt },
        { content: { body: { ja: "2", en: "two" } }, createdAt },
        { content: { body: { ja: "3", en: "three" } }, createdAt },
      ])
      .returning({ id: s.alert.id })
    // id は v7 なので、作った順は id の昇順と同じ。
    const order = made.map((row) => row.id).sort()
    const first = order[0] ?? ""

    expect((await alertsPage(get(token, adminAlertPath()))).alerts.map((row) => row.id))
      .toEqual(order)

    await alertAction(post(token, adminAlertPath(), {
      intent: "update-alert", alertId: first, ja: "直した", en: "fixed",
    }))

    expect((await alertsPage(get(token, adminAlertPath()))).alerts.map((row) => row.id))
      .toEqual(order)
  })

  /**
   * 表示中のアラートを消すのは、読者から見れば取り下げと同じ。まだ表示していない
   * ものを消しても誰も見ていないので、残す証跡が無い。
   */
  it("表示中のアラートを消したときだけ証跡が残る", async () => {
    const token = await signIn(CURATOR, true)
    const alertsOf = () => db.select().from(s.alert)
    const trail = () =>
      db.select().from(s.event).where(eq(s.event.subjectType, "alert"))

    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const draft = only(await alertsOf())
    await alertAction(post(token, adminAlertPath(), {
      intent: "delete-alert", alertId: draft.id,
    }))
    expect(await alertsOf()).toEqual([])
    expect(await trail()).toEqual([])

    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const up = only(await alertsOf())
    await alertAction(post(token, adminAlertPath(), {
      intent: "show-alert", alertId: up.id, ja: "お知らせ", en: "notice",
    }))
    await alertAction(post(token, adminAlertPath(), { intent: "delete-alert", alertId: up.id }))
    expect(await alertsOf()).toEqual([])
    expect((await trail()).map((row) => row.action))
      .toEqual(["publish-site-content", "unpublish-site-content"])
  })
})

describe("画面", () => {
  it("document の画面は、自分がどのバージョンかを表示する", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)

    const view = await documentPage(get(token, adminDocumentPath(id)), id)
    expect(view?.seriesOf).toMatchObject({ slug: "x", number: 1, isCurrent: true })
  })

  it("uuid でない id は 404 ではなく null で返る", async () => {
    const token = await signIn(CURATOR, true)
    expect(await documentPage(get(token, adminDocumentPath("not-a-uuid")), "not-a-uuid")).toBeNull()
    expect(await seriesPage(get(token, adminSeriesPath("not-a-uuid")), "not-a-uuid")).toBeNull()
  })

  it("系列の画面は、その系列のバージョンだけを新しい順に並べる", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    const series = only(await db.select().from(s.documentSeries))
    await makeDocument("x/version/3")
    await makeDocument("faq")

    const view = await seriesPage(get(token, adminSeriesPath(series.id)), series.id)
    expect(view?.series.revisions.map((one) => one.slug)).toEqual(["x/version/3", "x/version/1"])
    expect(view?.current?.slug).toBe("x/version/1")
  })

  it("**一覧は入力した語で絞られ、件数もその語のもの**", async () => {
    const token = await signIn(CURATOR, true)
    await makeDocument("faq")
    await makeDocument("nbdc-policy")
    await makeDocument("policy-japan")

    const view = await contentsPage(get(token, `${adminDocumentsPath()}?q=POLICY`))
    expect(view.rows.map((row) => row.kind === "document" ? row.document.slug : "")).toEqual([
      "nbdc-policy",
      "policy-japan",
    ])
    expect(view.total).toBe(2)
    expect(view.pageCount).toBe(1)
  })

  it("**言語の 2 つの絞り込みは AND で組み合わさる**", async () => {
    const token = await signIn(CURATOR, true)
    const both = await makeDocument("faq")
    await publishSide(both, "ja")
    await publishSide(both, "en")
    const jaOnly = await makeDocument("aim")
    await publishSide(jaOnly, "ja")

    const view = await contentsPage(
      get(token, `${adminDocumentsPath()}?ja=published&en=unpublished`),
    )
    expect(view.rows.map((row) => row.kind === "document" ? row.document.slug : "")).toEqual(["aim"])
  })

  it("バージョンの絞り込みは、バージョンのある記事だけを残す", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("x")
    await documentAction(post(token, adminDocumentPath(id), { intent: "cut-into-version", number: "1" }), id)
    await makeDocument("faq")

    const view = await contentsPage(get(token, `${adminDocumentsPath()}?versioning=versioned`))
    expect(view.rows.map((row) => row.kind === "series" ? row.series.slug : "")).toEqual(["x"])
  })

  it("**絞り込みの項目の件数は、その項目の条件だけ外した集合で数える**", async () => {
    const token = await signIn(CURATOR, true)
    const both = await makeDocument("faq")
    await publishSide(both, "ja")
    await publishSide(both, "en")
    const jaOnly = await makeDocument("aim")
    await publishSide(jaOnly, "ja")
    await makeDocument("neither")

    const view = await contentsPage(get(token, `${adminDocumentsPath()}?ja=published`))

    expect(view.rows).toHaveLength(2)
    // 自分の項目の条件は外して数えるので、日本語を絞っても両方の値に件数がある。
    expect(view.counts.ja).toEqual({ published: 2, unpublished: 1 })
    // 他の項目は日本語の条件を適用した 2 件の中で数える。
    expect(view.counts.en).toEqual({ published: 1, unpublished: 1 })
    expect(view.counts.versioning).toEqual({ versioned: 0, plain: 2 })
  })

  it("キーワードで絞った語も、絞り込みの項目の件数に反映される", async () => {
    const token = await signIn(CURATOR, true)
    const faq = await makeDocument("faq")
    await publishSide(faq, "ja")
    const policy = await makeDocument("nbdc-policy")
    await publishSide(policy, "ja")
    await makeDocument("policy-japan")

    const view = await contentsPage(get(token, `${adminDocumentsPath()}?q=policy`))
    expect(view.counts.ja).toEqual({ published: 1, unpublished: 1 })
  })

  it("フォームには保存した本文が入り、隣に描くプレビューも同じ本文から出る", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await publishSide(id, "ja", "公開分")
    await documentAction(post(token, adminDocumentPath(id), {
      intent: "save", locale: "ja", revision: "1", title: "題", body: "## 節\n\n保存した **本文**",
    }), id)

    const view = await documentPage(get(token, adminDocumentPath(id)), id)
    const ja = view?.editors.find((editor) => editor.locale === "ja")
    expect(ja?.body).toBe("## 節\n\n保存した **本文**")
    expect(ja?.html).toContain("<strong>本文</strong>")
    expect(ja?.revision).toBe(2)
    const published = await findDocument("faq", "ja")
    expect(published?.html).toContain("<strong>本文</strong>")
    // The pane's drawing keeps the heading's id and leaves out the link the
    // public page offers in the margin: the pane has no address to hand out.
    expect(ja?.html).toContain("id=\"節\"")
    expect(ja?.html).not.toContain("この見出しへのリンク")
    expect(published?.html).toContain("この見出しへのリンク")
  })
})

describe("隣に描くプレビュー", () => {
  function postJson(token: string, payload: unknown): Request {
    return new Request("http://localhost:8080/admin/documents/preview", {
      method: "POST",
      headers: { "cookie": cookie(token), "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  }

  it("入力した本文を、公開ページと同じ関数で描いて返す", async () => {
    const token = await signIn(CURATOR, true)
    const body = "# 見出し\n\n本文 **強調** と <b>タグ</b>"

    const drawn = await articlePreviewAction(postJson(token, { locale: "ja", title: "題", body }))

    expect(drawn.title).toBe("題")
    expect(drawn.html).toContain("<strong>強調</strong>")
    expect(drawn.html).toBe(renderMarkdown(body, "ja", { headingLinks: false }))
    expect(drawn.html).not.toContain("この見出しへのリンク")
    // Nothing was written: the words came from the form and went back drawn.
    expect(await db.select().from(s.documentContent)).toHaveLength(0)
  })

  it("形の違う問いは 400", async () => {
    const token = await signIn(CURATOR, true)
    const refused = await thrown(() => articlePreviewAction(postJson(token, { locale: "fr", body: 1 })))
    expect(refused.status).toBe(400)
  })

  it("manage-site-content の無い人には描かない", async () => {
    const token = await signIn(READER, false)
    const refused = await thrown(() => articlePreviewAction(postJson(token, { locale: "ja", title: "", body: "" })))
    expect(refused.status).toBe(403)
  })
})

describe("お知らせの公開日時と公開", () => {
  it("作ったばかりのお知らせは公開日時を持たない", async () => {
    const token = await signIn(CURATOR, true)
    await thrown(() => newsListAction(post(token, adminNewsListPath(), { intent: "create-news" })))

    expect(only(await db.select().from(s.news)).publishedAt).toBe(null)
  })

  it("公開日時が無いお知らせは公開できず、本文も書かれない", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({}).returning({ id: s.news.id })).id

    const result = await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    expect(result.status).toBe("undated")
    expect(await db.select().from(s.newsContent)).toEqual([])
  })

  it("公開中の言語があるあいだは公開日時を空にできず、公開停止すれば空にできる", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2020-01-01 09:00:00" })
      .returning({ id: s.news.id })).id
    await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    const refused = await newsAction(post(token, adminNewsPath(id), { intent: "set-date", publishedAt: "" }), id)
    expect(refused.status).toBe("dated-while-published")
    expect(only(await db.select().from(s.news)).publishedAt).toBe("2020-01-01 09:00:00")

    const revision = String(only(await db.select().from(s.newsContent)).revision)
    await newsAction(post(token, adminNewsPath(id), { intent: "unpublish", locale: "ja", revision }), id)
    const cleared = await newsAction(post(token, adminNewsPath(id), { intent: "set-date", publishedAt: "" }), id)
    expect(cleared.status).toBe("ok")
    expect(only(await db.select().from(s.news)).publishedAt).toBe(null)
  })

  it("一覧は、日時がまだ来ていない公開中の言語を公開予定として数える", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.news).values({ publishedAt: "2099-01-01 09:00:00" })
      .returning({ id: s.news.id })).id
    await newsAction(post(token, adminNewsPath(id), {
      intent: "publish", locale: "ja", revision: "", title: "題", body: "本文",
    }), id)

    const view = await newsListPage(get(token, adminNewsListPath()))
    expect(view.counts.ja).toEqual({ published: 0, scheduled: 1, unpublished: 0 })
    expect(view.counts.en).toEqual({ published: 0, scheduled: 0, unpublished: 1 })
    const narrowed = await newsListPage(get(token, `${adminNewsListPath()}?ja=scheduled`))
    expect(narrowed.rows.map((row) => row.id)).toEqual([id])
  })
})

/**
 * `updated_at` は「最後に変わった時刻」を表す列なので、書き換えるたびに動く。
 * 作った時刻のまま残ると、いつか「最終更新」に使った画面が警告なしに誤る。
 */
describe("最終更新の時刻", () => {
  const LONG_AGO = new Date("2020-01-01T00:00:00Z")
  const moved = (at: Date) => at.getTime() > LONG_AGO.getTime()

  it("本文の保存と公開で、その言語の行が動く", async () => {
    const token = await signIn(CURATOR, true)
    const id = await makeDocument("faq")
    await db.insert(s.documentContent).values({
      documentId: id, locale: "ja", content: { title: "題", body: "本文" }, updatedAt: LONG_AGO,
    })
    const newsId = only(await db.insert(s.news).values({ publishedAt: "2026-01-01 09:00:00" })
      .returning({ id: s.news.id })).id
    await db.insert(s.newsContent).values({
      newsId, locale: "ja", content: { title: "題", body: "本文" }, updatedAt: LONG_AGO,
    })

    expect((await documentAction(post(token, adminDocumentPath(id), {
      intent: "save", locale: "ja", revision: "1", title: "直した題", body: "本文",
    }), id)).status).toBe("ok")
    expect((await newsAction(post(token, adminNewsPath(newsId), {
      intent: "publish", locale: "ja", revision: "1", title: "題", body: "本文",
    }), newsId)).status).toBe("ok")

    expect(moved(only(await db.select().from(s.documentContent)).updatedAt)).toBe(true)
    expect(moved(only(await db.select().from(s.newsContent)).updatedAt)).toBe(true)
  })

  it("slug の変更・系列の張り替え・お知らせの日時・アラートの本文で、その行が動く", async () => {
    const token = await signIn(CURATOR, true)
    const id = only(await db.insert(s.document).values({ slug: "faq", updatedAt: LONG_AGO })
      .returning({ id: s.document.id })).id
    await documentAction(post(token, adminDocumentPath(id), { intent: "rename", slug: "faq2" }), id)
    expect(moved(only(await db.select().from(s.document).where(eq(s.document.id, id))).updatedAt)).toBe(true)

    const first = await makeDocument("x")
    await publishSide(first, "ja", "一つ目")
    await documentAction(post(token, adminDocumentPath(first), { intent: "cut-into-version", number: "1" }), first)
    const series = only(await db.select().from(s.documentSeries))
    await db.update(s.documentSeries).set({ updatedAt: LONG_AGO })
    const second = await makeDocument("x/version/2")
    await seriesAction(post(token, adminSeriesPath(series.id), { intent: "repoint-series", documentId: second }), series.id)
    expect(moved(only(await db.select().from(s.documentSeries)).updatedAt)).toBe(true)

    const newsId = only(await db.insert(s.news).values({ updatedAt: LONG_AGO }).returning({ id: s.news.id })).id
    await newsAction(post(token, adminNewsPath(newsId), { intent: "set-date", publishedAt: "2026-03-01T09:30" }), newsId)
    expect(moved(only(await db.select().from(s.news)).updatedAt)).toBe(true)

    await alertAction(post(token, adminAlertPath(), { intent: "create-alert" }))
    const alert = only(await db.select().from(s.alert))
    await db.update(s.alert).set({ updatedAt: LONG_AGO })
    await alertAction(post(token, adminAlertPath(), { intent: "update-alert", alertId: alert.id, ja: "直した", en: "fixed" }))
    expect(moved(only(await db.select().from(s.alert)).updatedAt)).toBe(true)
  })
})
