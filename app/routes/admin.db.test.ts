import { isNull } from "drizzle-orm"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { grantAdmin, isAdmin, listAdmins } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import { createInvitation } from "~/auth/invitations.server"

import type { Route } from "./+types/admin"
import type { Route as InviteRoute } from "./+types/admin-invite"
import { action, loader } from "./admin"
import { loader as inviteLoader } from "./admin-invite"

type InviteArgs = InviteRoute.LoaderArgs

const db = getDb()
const ME = { sub: "me-0001", name: "curator", idToken: "an-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function signIn(who = ME): Promise<string> {
  return createSession(db, who)
}

function cookie(token: string): string {
  return sessionCookie(token).split(";")[0] ?? ""
}

function get(token: string, query = ""): Route.LoaderArgs {
  const request = new Request(`http://localhost:8080/admin${query}`, { headers: { cookie: cookie(token) } })
  return { request, params: {} } as unknown as Route.LoaderArgs
}

function post(token: string, fields: Record<string, string>): Route.ActionArgs {
  const request = new Request("http://localhost:8080/admin", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cookie": cookie(token) },
    body: new URLSearchParams(fields).toString(),
  })
  return { request, params: {} } as unknown as Route.ActionArgs
}

async function thrownResponse(pending: Promise<unknown>): Promise<Response> {
  try {
    await pending
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
  throw new Error("expected a response to be thrown")
}

async function status(pending: Promise<unknown>): Promise<number> {
  try {
    await pending
  } catch (thrown) {
    if (thrown instanceof Response) return thrown.status
    throw thrown
  }
  return 200
}

describe("管理画面のトップ", () => {
  it("admin には管理者・操作の記録・アプリのバージョンを出す", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    vi.stubEnv("HUMANDBS_VERSION", "2a6a2b76")
    try {
      const view = await loader(get(await signIn()))

      expect(view.admins?.map((admin) => admin.sub)).toEqual([ME.sub])
      expect(view.events?.rows.map((row) => row.action)).toEqual(["grant-admin"])
      expect(view.version).toBe("2a6a2b76")
      expect(view.sub).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("admin でない人には、本人の sub のほかは何も出さない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "someone", name: "someone" })

    const view = await loader(get(await signIn()))

    expect(view).toMatchObject({ sub: ME.sub, admins: null, events: null, upstream: null, version: null })
  })

  it("操作の記録の条件は URL から読む", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "other", name: "other" })

    const view = await loader(get(await signIn(), "?action=revoke-admin"))

    expect(view.events?.total).toBe(0)
    expect(view.events?.counts["grant-admin"]).toBe(2)
  })
})

describe("招待リンクと管理者の削除", () => {
  it("招待リンクを作ると、このサイトのアドレスのリンクを 1 度だけ返し、一覧には作成者だけが出る", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    const token = await signIn()

    const answer = await action(post(token, { intent: "create-invitation" }))

    expect(answer).toMatchObject({ status: "ok", done: "invited" })
    const link = answer.status === "ok" && answer.done === "invited" ? answer.link : ""
    expect(link).toMatch(/^https?:\/\/[^/]+\/admin\/invite\/[A-Za-z0-9_-]{43}$/)
    const view = await loader(get(token))
    expect(view.invitations).toHaveLength(1)
    expect(view.invitations?.[0]?.createdByName).toBe(ME.name)
    expect(JSON.stringify(view)).not.toContain(link.split("/").at(-1))
  })

  it("招待リンクを削除できる。もう無いものは理由を返す", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    const token = await signIn()
    await action(post(token, { intent: "create-invitation" }))
    const id = (await loader(get(token))).invitations?.[0]?.id ?? ""

    expect(await action(post(token, { intent: "cancel-invitation", invitationId: id }))).toEqual({ status: "ok", done: "cancelled" })
    expect(await action(post(token, { intent: "cancel-invitation", invitationId: id }))).toEqual({ status: "refused", reason: "gone" })
    expect((await loader(get(token))).invitations).toEqual([])
  })

  it("ほかの admin は削除でき、自分は削除できない", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "other", name: "Other" })
    const token = await signIn()

    expect(await action(post(token, { intent: "revoke-admin", sub: ME.sub, name: ME.name })))
      .toEqual({ status: "refused", reason: "self" })
    expect(await action(post(token, { intent: "revoke-admin", sub: "other", name: "Other" })))
      .toEqual({ status: "ok", done: "revoked", name: "Other" })
    expect((await listAdmins(db)).map((admin) => admin.sub)).toEqual([ME.sub])
  })

  it("admin でない人は、招待も削除もできない (403)", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "other", name: "Other" })
    const token = await signIn()

    expect(await status(action(post(token, { intent: "create-invitation" })))).toBe(403)
    expect(await status(action(post(token, { intent: "revoke-admin", sub: "other" })))).toBe(403)
    expect(await db.select().from(s.adminInvitation)).toEqual([])
    expect(await isAdmin(db, "other")).toBe(true)
  })
})

describe("招待リンクを開く", () => {
  function opened(token: string | null, invitation: string): InviteArgs {
    const headers = token === null ? undefined : { cookie: cookie(token) }
    const request = new Request(`http://localhost:8080/admin/invite/${invitation}`, { headers })
    return { request, params: { token: invitation } } as unknown as InviteArgs
  }

  it("ログインしていなければログインへ送り、招待は使わない", async () => {
    const invitation = await createInvitation(db, { sub: "inviter", name: "Inviter" })

    expect(await status(inviteLoader(opened(null, invitation)))).toBe(302)

    expect(await db.select().from(s.adminInvitation).where(isNull(s.adminInvitation.usedAt))).toHaveLength(1)
  })

  it("ログインしている人が開くと、そのまま Keycloak の名前で管理者になり、トップへ移る", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, { sub: "inviter", name: "Inviter" })
    const invitation = await createInvitation(db, { sub: "inviter", name: "Inviter" })
    const token = await signIn()

    const moved = await thrownResponse(inviteLoader(opened(token, invitation)))

    expect(moved.status).toBe(302)
    expect(moved.headers.get("location")).toBe("/admin")
    expect((await listAdmins(db)).find((admin) => admin.sub === ME.sub)?.name).toBe(ME.name)
    // Opened again by the same person, the link goes to the same place.
    expect((await thrownResponse(inviteLoader(opened(token, invitation)))).headers.get("location")).toBe("/admin")
  })

  it("すでに管理者の人には、招待を使わなかったことを表示する", async () => {
    await grantAdmin(db, BOOTSTRAP_ACTOR, ME)
    const invitation = await createInvitation(db, ME)

    expect((await inviteLoader(opened(await signIn(), invitation))).outcome).toBe("already")
  })

  it("使えないリンクは理由を返し、誰も管理者にしない", async () => {
    const view = await inviteLoader(opened(await signIn(), "not-a-token"))

    expect(view.outcome).toBe("unknown")
    expect(await isAdmin(db, ME.sub)).toBe(false)
  })
})
