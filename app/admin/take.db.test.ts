import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { grantAdmin } from "~/auth/admins.server"
import { BOOTSTRAP_ACTOR } from "~/auth/events.server"
import { createSession, sessionCookie } from "~/auth/session.server"
import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import { seedVersion } from "~/db/seed"

import { createResearchWithDraft, draftUpdating } from "./drafts.server"
import { takePage } from "./take.server"

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
 * the draft does not stand as a row of its own, and the version's row carries
 * it — whose it is, and whether it has written anything to take.
 */
describe("a version being updated, among the sources", () => {
  async function updated() {
    const { researchId, draftId } = await createResearchWithDraft(db)
    const versionId = await seedVersion(db, { researchId, number: 1, datasets: [] })
    const update = await draftUpdating(db, researchId, versionId)
    if (update.status !== "opened") throw new Error(update.status)
    const token = await signIn()
    const get = (at: string, query = "") => new Request(
      `http://localhost:8080/admin/research/${researchId}/draft/${at}/take${query}`,
      { headers: new Headers({ cookie: sessionCookie(token).split(";")[0] ?? "" }) },
    )
    return { researchId, draftId, updateId: update.draftId, get }
  }

  it("folds the update into its version's row, for the update itself and for any other draft", async () => {
    const at = await updated()

    for (const from of [at.updateId, at.draftId]) {
      const view = await takePage(at.get(from), "ja", { researchId: at.researchId, draftId: from })
      expect(view.rows.filter((row) => row.kind === "draft").map((row) => row.id)).not.toContain(at.updateId)
      const version = view.rows.find((row) => row.kind === "version")
      expect(version?.kind === "version" ? version.update?.id : null).toBe(at.updateId)
    }
  })

  /** Chosen from another draft, the update is named by the time its version's row shows — it has no row of its own. */
  it("takes the update from its version's row, with the time and the version it is named by", async () => {
    const at = await updated()

    const view = await takePage(
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
