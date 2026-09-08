import { expect, test } from "@playwright/test"

/**
 * What the management area answers to somebody who is not signed in
 * (`docs/testing.md` の P-ANON).
 *
 * **This runs with no session at all**, which is the point: the screens under
 * `/admin` are exactly the ones a signed-in scenario could make pass by
 * accident. The redirect is read rather than followed — following it leaves the
 * portal for the identity provider, which is not what is being tested.
 */
test.describe("P-ANON 管理画面", () => {
  test("S-ADMIN-00: 署名の無いブラウザは、どの管理画面もサインインに送られる", async ({ request }) => {
    for (const path of ["/admin", "/admin/research", "/admin/experiment-fields", "/admin/contents"]) {
      const answer = await request.get(path, { maxRedirects: 0 })
      expect(answer.status(), path).toBe(302)
      // The address it was asked for travels with it, so signing in lands where
      // the reader was going.
      const to = new URL(answer.headers().location ?? "", "http://invalid.example")
      expect(to.pathname, path).toBe("/auth/login")
      expect(to.searchParams.get("redirect"), path).toBe(path)
    }
  })
})
