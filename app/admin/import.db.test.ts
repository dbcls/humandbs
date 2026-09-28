import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import { seedVersion } from "~/db/seed"

import { createEmptyDraft, createResearchWithDraft, draftUpdating, saveDraftContent } from "./drafts.server"
import { researchContentInput } from "./form"
import { researchContentOf } from "./form.server"
import { importAction, importPage } from "./import.server"
import { readDraft } from "./queries.server"

const db = getDb()
const SIGNED_IN = { sub: "0f3a-1b2c", name: "curator", idToken: "an-id-token" }

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

async function signIn(): Promise<string> {
  const token = await createSession(db, SIGNED_IN)
  await grantAdmin(db, BOOTSTRAP_ACTOR, SIGNED_IN)
  return token
}

/**
 * An update is its version's row on the research's screen, so it is here too:
 * the draft is not shown as a row of its own, and the version's row shows
 * it — whose it is, and whether it has written anything to import.
 */
describe("a version being updated, among the sources", () => {
  async function updated() {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const versionId = await seedVersion(db, { researchId, number: 1, datasets: [] })
    const update = await draftUpdating(db, researchId, versionId)
    if (update.status !== "opened") throw new Error(update.status)
    const token = await signIn()
    const get = (at: string, query = "") => new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${at}/import${query}`,
      { headers: new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" }) },
    )
    return { researchId, draftId, updateId: update.draftId, get }
  }

  it("merges the update into its version's row, for the update itself and for any other draft", async () => {
    const at = await updated()

    for (const from of [at.updateId, at.draftId]) {
      const view = await importPage(at.get(from), "ja", { researchId: at.researchId, draftId: from })
      expect(view.rows.filter((row) => row.kind === "draft").map((row) => row.id)).not.toContain(at.updateId)
      const version = view.rows.find((row) => row.kind === "version")
      expect(version?.kind === "version" ? version.update?.id : null).toBe(at.updateId)
    }
  })

  /** Chosen from another draft, the update is named by the time its version's row shows — it has no row of its own. */
  it("imports the update from its version's row, with the time and the version it is named by", async () => {
    const at = await updated()

    const view = await importPage(
      at.get(at.draftId, `?draft=${at.updateId}`),
      "ja",
      { researchId: at.researchId, draftId: at.draftId },
    )

    const source = view.chosen?.source
    expect(source?.kind).toBe("draft")
    if (source?.kind !== "draft") return
    expect(source.id).toBe(at.updateId)
    expect(Number.isNaN(Date.parse(source.updatedAt))).toBe(false)
    expect(source.updating).toBe(1)
  })
})

describe("the draft being imported into", () => {
  it("is refused as not found when asked for as its own source", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const other = await createEmptyDraft(db, researchId)
    const token = await signIn()
    const get = (query: string) => new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${draftId}/import${query}`,
      { headers: new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" }) },
    )

    const refused = await importPage(get(`?draft=${draftId}`), "ja", { researchId, draftId }).then(
      () => null,
      (thrown: unknown) => thrown,
    )
    expect(refused).toBeInstanceOf(Response)
    expect((refused as Response).status).toBe(404)
    // Another draft of the same research is a source.
    expect((await importPage(get(`?draft=${other}`), "ja", { researchId, draftId })).chosen?.source)
      .toMatchObject({ kind: "draft", id: other })
  })
})

describe("confirming an import", () => {
  it("is checked against the revision the form was opened at, as a save is, and writes nothing on a conflict", async () => {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const token = await signIn()
    const opened = await readDraft(db, draftId)
    if (opened === null) throw new Error("no draft")
    // Somebody else saves while the import screen is open.
    const saved = await saveDraftContent(db, { draftId, revision: opened.revision }, {
      content: researchContentOf(researchContentInput(opened.content)),
    })
    expect(saved.status).toBe("saved")
    const between = await readDraft(db, draftId)

    const imported = researchContentInput(opened.content)
    const post = (revision: number) => new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${draftId}/import`,
      {
        method: "POST",
        headers: new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" }),
        body: new URLSearchParams({
          revision: String(revision),
          content: JSON.stringify({ ...imported, title: { ja: { state: "value", text: "取り込んだ題" }, en: imported.title.en } }),
        }),
      },
    )

    expect(await importAction(post(opened.revision), "ja", { researchId, draftId })).toEqual({ status: "conflict" })
    expect(await readDraft(db, draftId)).toEqual(between)

    const done = await importAction(post(between?.revision ?? -1), "ja", { researchId, draftId })
    expect(done).toBeInstanceOf(Response)
    expect((await readDraft(db, draftId))?.content.title.ja).toEqual({ state: "value", value: "取り込んだ題" })
  })
})
