import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { closePools, getDb, getOwnerDb } from "~/db/client.server"
import { emptyDatabase } from "~/db/empty.server"
import * as s from "~/db/schema"

import type { Route } from "./+types/document"
import { loader } from "./document"

/**
 * The catch-all route as a reader following a link reaches it.
 *
 * **A client-side navigation asks for `<path>.data`.** The suffix is taken off
 * before the route is matched but stays on the request, so the two ways of
 * arriving at the same page hand the loader two different URLs. Every case here
 * is given the data form, which is the one nobody sees by opening an address.
 */
const db = getDb()

beforeEach(async () => {
  await emptyDatabase(getOwnerDb())
})

afterAll(async () => {
  await closePools()
})

/** What a splat route is handed for a client-side navigation to `path`. */
function followed(path: string): Route.LoaderArgs {
  return {
    request: new Request(`http://localhost${path}.data`),
    params: { "*": path.replace(/^\/+/, "") },
  } as unknown as Route.LoaderArgs
}

async function createDocument(slug: string): Promise<void> {
  const [row] = await db.insert(s.document).values({ slug }).returning({ id: s.document.id })
  if (row === undefined) throw new Error("expected exactly one row")
  await db.insert(s.documentContent).values({
    documentId: row.id,
    locale: "ja",
    content: { title: slug, body: "body" },
    published: true,
  })
}

async function thrownBy(load: Promise<unknown>): Promise<Response> {
  try {
    await load
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    throw thrown
  }
  throw new Error("expected the loader to throw")
}

describe("リンクを辿って開いた document", () => {
  it("階層を持つ slug がそのページに解決する", async () => {
    await createDocument("guidelines/data-sharing-guidelines")
    const { article } = await loader(followed("/guidelines/data-sharing-guidelines"))
    expect(article.title).toBe("guidelines/data-sharing-guidelines")
  })

  it("裸の hum ラベルが research へ redirect する", async () => {
    const response = await thrownBy(loader(followed("/hum0103")))
    expect(response.headers.get("location")).toBe("/research/hum0103")
  })

  it("冗長な ja prefix が prefix 無しへ redirect する", async () => {
    const response = await thrownBy(loader(followed("/ja/faq")))
    expect(response.headers.get("location")).toBe("/faq")
  })

  it("公開されていない slug は 404 のまま", async () => {
    const response = await thrownBy(loader(followed("/no-such-slug")))
    expect(response.status).toBe(404)
  })
})
